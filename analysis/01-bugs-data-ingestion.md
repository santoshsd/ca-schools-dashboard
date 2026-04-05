# 01 — Bugs in the CDE Data Ingestion Pipeline

Primary file: `server/ingest-cde-data.ts` (560 lines)
Related: `server/ingestion-agent.ts`, `shared/schema.ts` (`data_ingestion_logs`)

The ingestion code is the single most important — and most broken — part of the platform.
Every finding below was verified against commit `909df37`.

---

## CRITICAL

### INGEST-01 · No transaction wraps the full ingestion run
**File:** `server/ingest-cde-data.ts:525-547`

```ts
export async function runFullIngestion() {
  // ...
  try {
    await clearExistingData();                                    // line 532
    const { indicatorMap, groupMap } = await ingestIndicatorsAndGroups();
    const { countyMap, districtMap, schoolMap } = await ingestSchoolDirectory();
    await ingestGraduationData(countyMap, districtMap, schoolMap, indicatorMap, groupMap);
    await ingestSuspensionData(countyMap, districtMap, schoolMap, indicatorMap, groupMap);
    // ...
  } catch (e: any) {
    console.error("[Ingestion] Fatal error:", e);
    await logIngestion("Full Ingestion", "error", 0, 0, e.message);
    throw e;
  }
}
```

`clearExistingData()` deletes **every row** in `performance_data`, `schools`, `districts`,
`counties`, `indicators`, `student_groups` (lines 80-89), then ingestion re-populates them
sequentially over many minutes. If any later step fails (network timeout on the 200+ MB CDE
directory, a single bad row, a DB deadlock), the database is left empty or partially filled
and there is **no rollback**.

**Evidence this is already happening in production:** the live `/api/platform/stats`
returns `{counties: 16, schools: 20, ...}`. CA has 58 counties and ~10,000 public schools.
The most plausible explanation is that a previous ingestion run cleared the data, ingested a
seed batch, then failed before completing the real school-directory load — and nothing caught
it.

**Fix:** wrap the whole run in `db.transaction(async (tx) => { ... })`, or better, ingest into a
staging schema and swap via `ALTER SCHEMA ... RENAME`. Never clear production tables without a
committed replacement ready.

---

### INGEST-02 · Batch insert errors are silently swallowed
**File:** `server/ingest-cde-data.ts:380-391` (graduation), `506-517` (suspension)

```ts
for (let i = 0; i < batch.length; i += 500) {
  try {
    await db.insert(performanceData).values(batch.slice(i, i + 500));
    totalInserted += Math.min(500, batch.length - i);
  } catch (e: any) {
    totalFailed += Math.min(500, batch.length - i);
    console.error(`[Ingestion] Batch insert error (graduation): ${e.message}`);
  }
}
```

Problems:
1. The error is logged to `console.error` only — it is **never** written to
   `data_ingestion_logs`, so post-hoc audit is impossible.
2. `totalFailed` is incremented, but the loop continues. A constraint-violation or connection
   error at batch 3 keeps punching through batches 4…N that will all fail identically.
3. No retry with back-off for transient errors (connection reset, Postgres deadlock).
4. No distinction between recoverable (timeout) and permanent (unique/FK violation) errors.
5. The `logIngestion(..., "completed", ...)` call at line 395 still claims `completed` even if
   `totalFailed > 0`.

**Fix:** distinguish error classes, retry transient ones with exponential back-off, write
per-batch failures (including a row sample) to `data_ingestion_logs`, and mark the run
`error` / `partial` when any batch fails.

---

### INGEST-03 · `performanceData` inserts are not idempotent
**File:** `server/ingest-cde-data.ts:382, 508` (and all other `db.insert(...)` calls in this file)

No `onConflictDoNothing` / `onConflictDoUpdate` anywhere. Combined with INGEST-01, the only
way to "re-run" ingestion is to `clearExistingData()` first — making a safe incremental
re-ingest impossible. This compounds INGEST-01: the bug cannot be fixed by simply re-running
the script, because the second run will either trip unique constraints (once SCHEMA-03 lands,
see doc 03) or duplicate rows if the constraint is absent (today's state).

**Fix:** add a natural unique key on `performance_data`
(`school_id, district_id, county_id, indicator_id, student_group_id, academic_year`, with a
unique partial index that accounts for nullable parent ids) and use
`.onConflictDoUpdate({ target: [...], set: { ... } })`.

---

## HIGH

### INGEST-04 · `fetchTSV` has no size limit and a single 120s timeout
**File:** `server/ingest-cde-data.ts:57-67`

```ts
async function fetchTSV(url: string): Promise<string[][]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (CASchoolDashboardAPI/1.0)" },
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  return lines.map(l => l.split("\t"));
}
```

- No `Content-Length` check before reading. The school directory file is tens of MB today;
  if CDE ever serves a much larger file (or a corrupted HTML error page), this function
  buffers the entire response into memory.
- `res.text()` + `split("\n")` holds ~2× the file size in memory at peak.
- No retry, no exponential back-off, no jitter. One transient failure aborts the whole run
  (and via INGEST-01 corrupts the DB).
- The 120 s wall-clock timeout applies to both connect and read combined; a slow stream that
  produces progress but crosses 120 s is killed.
- Inconsistent with `server/ingestion-agent.ts:34-37` which uses a 15 s HEAD timeout.

**Fix:** stream the body line-by-line (`node:readline` over `res.body`), check
`Content-Length` against a configurable cap, retry 3× with exponential back-off + jitter,
and make connect/read timeouts configurable and separate.

---

### INGEST-05 · Fetch failure silently continues, losing the most recent year
**File:** `server/ingest-cde-data.ts:285-294, 411-420`

```ts
for (const fileKey of years) {
  const url = `https://www3.cde.ca.gov/demo-downloads/acgr/${fileKey}.txt`;
  let rows: string[][];
  try {
    rows = await fetchTSV(url);
  } catch (e: any) {
    console.error(`[Ingestion] Failed to fetch ${url}: ${e.message}`);
    await logIngestion(`Graduation Rate (${fileKey})`, "error", 0, 0, e.message);
    continue;   // silently moves to older year
  }
  // ...
}
```

`years = ["acgr24", "acgr23-v2"]` — if the current-year file fails to fetch, the run still
completes "successfully" with only stale data. No alert is raised and the overall ingestion
log is marked `completed`. Operators have to eyeball `data_ingestion_logs` to notice. Same
pattern for suspension data.

**Fix:** track a per-source success flag; if the *most recent* year fails, either retry
aggressively or mark the run `partial`/`error` and fire an alert.

---

### INGEST-06 · Hardcoded file-key years
**File:** `server/ingest-cde-data.ts:280, 406`

```ts
const years = ["acgr24", "acgr23-v2"];          // graduation
const years = ["suspension24", "suspension23"]; // suspension
```

When CDE publishes the 2025 files the pipeline keeps pulling 2024 data forever — no error,
just silent staleness. The upstream dashboard page
<https://www.cde.ca.gov/ta/ac/cm/dashboardresources.asp> links to the files; a tiny HTML
scrape (or a `HEAD` sweep of plausible names) would let the pipeline discover new years
automatically.

**Fix:** scrape the dashboard resources page or probe a year-name convention; fall back to
the hardcoded list only as a safety net.

---

### INGEST-07 · Rows that don't match the reporting-category map are silently dropped
**File:** `server/ingest-cde-data.ts:315-316, 441-442`

```ts
const groupCode = CDE_REPORTING_CATEGORY_MAP[cat];
if (!groupCode || !groupMap.has(groupCode)) continue;
```

Any `ReportingCategory` value that's not in the hardcoded map on lines 5-24 is dropped
without logging. If CDE introduces a new category (they have done so historically), rows
start disappearing from the load with zero visibility.

**Fix:** count unknown categories per ingest, log a warning summary, and include the counts
in `data_ingestion_logs.details`.

---

### INGEST-08 · `0 || null` data-fidelity bug
**File:** `server/ingest-cde-data.ts:323-324, 449-450`

```ts
const cohort    = parseInt(row[cohortIdx]?.trim() || "0") || null;
const gradCount = parseInt(row[gradCountIdx]?.trim() || "0") || null;
```

`parseInt("0") === 0`, and `0 || null` evaluates to `null`. A legitimate zero cohort or zero
graduate count is silently coerced to NULL, polluting downstream aggregations.

**Fix:** use `Number.isFinite(parsed) ? parsed : null`.

---

### INGEST-09 · Ingestion order leaves inconsistent state on partial failure
**File:** `server/ingest-cde-data.ts:532-536`

```ts
await clearExistingData();
const { indicatorMap, groupMap }  = await ingestIndicatorsAndGroups();   // inserts indicators + groups
const { countyMap, districtMap, schoolMap } = await ingestSchoolDirectory(); // fetches 200+MB
```

If the school directory fetch throws (INGEST-04), `indicators` and `student_groups` are
already inserted, but `counties`/`districts`/`schools`/`performance_data` are empty.
API callers see inconsistent reference data. Overlaps with INGEST-01 but documented
separately because it suggests the re-order (`ingestSchoolDirectory` first, *then* indicators)
is safer even before the transaction lands.

---

## MEDIUM

### INGEST-10 · Batch sizes are tiny
**File:** `server/ingest-cde-data.ts:192, 209, 237, 380, 506`

- Counties: 100/batch
- Districts: 200/batch
- Schools: 200/batch
- Performance data: 500/batch

These are ~10× smaller than Postgres can comfortably handle. On a full-state load
(~10 k schools, ~1 M performance rows across years/groups), this translates into thousands of
round trips. Recommend 1,000–2,000 per batch for schools, 2,000–5,000 for `performance_data`.
For the biggest table, consider `COPY` via the `pg` driver for an order-of-magnitude gain.

### INGEST-11 · `logIngestion` never sets `startedAt`
**File:** `server/ingest-cde-data.ts:69-78`

```ts
await db.insert(dataIngestionLogs).values({
  source, status, recordsProcessed, recordsFailed, details,
  completedAt: status !== "checking" ? new Date() : null,
});
```

`started_at` is defaulted by the schema (`defaultNow()`, `shared/schema.ts:142`), so all log
rows show `started_at ≈ completed_at`. Duration cannot be computed from the log. Should
record `startedAt` at the top of each stage and pass it through.

### INGEST-12 · Unused import
**File:** `server/ingest-cde-data.ts:1`

```ts
import { db, pool } from "./db";
```

`pool` is never used. Cosmetic.

### INGEST-13 · Misleading User-Agent
**File:** `server/ingest-cde-data.ts:60`, `server/ingestion-agent.ts:36`

```ts
"User-Agent": "Mozilla/5.0 (CASchoolDashboardAPI/1.0)"
```

Pretending to be a browser. CDE logs see a fake Mozilla UA. A truthful UA like
`CASchoolDashboard/1.0 (+https://caschooldatahub.s13i.me)` is both polite and lets CDE
contact the operator if the crawler misbehaves.

### INGEST-14 · `ingestIndicatorsAndGroups` has no conflict handling and would fail on re-run without a clear
**File:** `server/ingest-cde-data.ts:259, 266`

```ts
const inserted = await db.insert(indicators).values(INDICATOR_DEFS).returning();
// ...
const insertedGroups = await db.insert(studentGroups).values(groupValues).returning();
```

Both target columns have unique constraints on `code`. Running twice without a clear throws.
Should use `onConflictDoUpdate({ target: indicators.code, set: {...} })`.

---

## Summary of fixes needed in this file

Minimum viable fix set to make ingestion safe:

1. Wrap `runFullIngestion` in `db.transaction(async (tx) => { ... })` — or ingest into a
   staging schema and swap.
2. Replace every `db.insert(...).values(...)` in this file with an idempotent upsert.
3. Stream-parse TSVs with a size cap and retries.
4. Write per-batch errors to `data_ingestion_logs` and mark runs `partial`/`error` correctly.
5. Abort the run — don't `continue` — when the most recent year fails to fetch.
6. Fix `0 || null` coercion.
7. Discover year file-keys dynamically.
8. Raise batch sizes to 1 k–5 k.

The production re-ingest runbook in [`07-reingest-runbook.md`](./07-reingest-runbook.md)
assumes at minimum fixes #1, #2, and #4 have landed.

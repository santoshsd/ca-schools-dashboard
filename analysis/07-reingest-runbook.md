# 07 — Safe Re-Ingest Runbook

> ⛔ **DO NOT RUN this procedure until P0-A fixes from
> [`06-production-readiness-roadmap.md`](./06-production-readiness-roadmap.md) have landed.**
>
> The current `server/ingest-cde-data.ts` at commit `909df37` has the bugs documented in
> [`01-bugs-data-ingestion.md`](./01-bugs-data-ingestion.md#critical). Running it again as-is
> risks leaving the database in the same or a worse half-populated state.

This runbook is the reference procedure to rebuild production data from CDE sources **after**
the ingestion pipeline has been made transactional and idempotent.

---

## 0. Prerequisites (verify before starting)

Check that all of the following are true. Do not proceed if any are false.

- [ ] INGEST-01 fix merged: `runFullIngestion` wraps all stages in a transaction **or** uses
      the staging-schema swap pattern described below.
- [ ] INGEST-02 fix merged: every batch-insert error is written to `data_ingestion_logs` with
      source, row count, sample row, and status `partial` or `error` (never `completed`
      when any batch failed).
- [ ] INGEST-03 fix merged: every insert uses `.onConflictDoUpdate(...)` with the dedupe key.
- [ ] SCHEMA-02 + SCHEMA-03 migrations applied: CHECK constraint on `reporting_level`
      consistency, unique partial indexes on the dedupe key.
- [ ] INGEST-05 fix merged: missing current-year file aborts the run instead of silently
      continuing.
- [ ] A monitoring webhook (Slack / email / PagerDuty) is configured to fire on any
      `data_ingestion_logs` row with `status != 'completed'`.
- [ ] A database snapshot mechanism exists. On managed Postgres (Azure / RDS / Neon /
      Supabase / Fly) this is point-in-time recovery. On self-hosted Postgres, a
      `pg_dump` to object storage works.
- [ ] The **staging** environment has successfully ingested the full CDE dataset at least
      once, producing row counts within the expected ranges below.

### Expected row counts (for verification at step 5)

| Table | Expected range (CA statewide) |
|---|---|
| `counties` | 58 (exactly) |
| `districts` | ~1,000 ± 10% |
| `schools` (active, with `isActive = true`) | ~9,500 – 10,500 |
| `indicators` | 7 (from `INDICATOR_DEFS` in `ingest-cde-data.ts`) |
| `student_groups` | 18 (from `STUDENT_GROUP_NAMES`) |
| `performance_data` (graduation, 2 years × ~18 groups × ~10k schools) | ~300k – 500k |
| `performance_data` (suspension, 2 years × ~18 groups × ~10k schools + aggregates) | ~300k – 600k |
| `performance_data` total | ~600k – 1.1M |

If any of these come in wildly off (e.g. `counties = 16`, `schools = 20`), that is the exact
symptom we are trying to avoid — abort and investigate.

---

## 1. Take a snapshot

On your host of choice:

- **Neon / Supabase / managed Postgres:** create a named branch or take a point-in-time
  backup. Note the snapshot id.
- **Self-hosted:**
  ```bash
  pg_dump --format=custom --file="pre-reingest-$(date +%F).dump" "$DATABASE_URL"
  ```

Store the snapshot id in the change ticket so rollback is one command.

---

## 2. Run the ingest against a staging schema

Assuming the staging-schema swap pattern (recommended), the job should:

1. `CREATE SCHEMA staging_ingest_<timestamp>;`
2. Clone the empty structure (no data) of every target table into that schema.
3. Run `runFullIngestion()` pointed at the staging schema via a connection search path.
4. If the run completes and the verification queries in step 3 pass, swap:
   ```sql
   BEGIN;
   ALTER SCHEMA public RENAME TO public_old_<timestamp>;
   ALTER SCHEMA staging_ingest_<timestamp> RENAME TO public;
   COMMIT;
   ```
5. Keep `public_old_<timestamp>` around for 24-72 h, then drop.

If a single-transaction approach is used instead (simpler but holds locks longer), just
invoke `runFullIngestion()` from a one-shot script:

```bash
NODE_ENV=production tsx server/ingest-cde-data.ts 2>&1 | tee ingest-$(date +%F-%H%M).log
```

Watch the log. Any `Batch insert error` or `Fatal error` is an abort condition.

---

## 3. Verification queries

Run these against the new data **before** declaring success. Each should match the
expected-range row above.

```sql
SELECT count(*) AS counties     FROM counties;
SELECT count(*) AS districts    FROM districts;
SELECT count(*) AS schools      FROM schools WHERE is_active;
SELECT count(*) AS indicators   FROM indicators;
SELECT count(*) AS student_groups FROM student_groups;
SELECT count(*) AS perf_total   FROM performance_data;
SELECT reporting_level, count(*) FROM performance_data GROUP BY reporting_level ORDER BY 1;
SELECT indicator_id, count(*)    FROM performance_data GROUP BY indicator_id ORDER BY 1;
SELECT academic_year, count(*)   FROM performance_data GROUP BY academic_year ORDER BY 1;

-- No orphan FKs (should all be zero)
SELECT count(*) FROM districts d LEFT JOIN counties c ON c.id = d.county_id WHERE c.id IS NULL;
SELECT count(*) FROM schools   s LEFT JOIN districts d ON d.id = s.district_id WHERE d.id IS NULL;
SELECT count(*) FROM performance_data p
  WHERE p.reporting_level = 'school' AND p.school_id IS NULL;

-- No duplicate rows under the dedupe key
SELECT school_id, indicator_id, student_group_id, academic_year, count(*)
  FROM performance_data
  WHERE reporting_level = 'school'
  GROUP BY 1,2,3,4
  HAVING count(*) > 1
  LIMIT 5;

-- Ingestion log: every source should end as 'completed'
SELECT source, status, records_processed, records_failed, started_at, completed_at
  FROM data_ingestion_logs
  WHERE started_at > now() - interval '2 hours'
  ORDER BY started_at DESC;
```

Acceptance criteria:

- Every row count is within the expected range above.
- No orphan FK rows.
- No duplicate-key rows.
- Every `data_ingestion_logs` entry for this run has `status = 'completed'` and
  `records_failed = 0`.

---

## 4. Smoke-test the live API

From your workstation, with a throwaway API key minted after the swap:

```bash
API_KEY="csd_..."
BASE="https://caschooldatahub.s13i.me"

curl -s "$BASE/api/platform/stats" | jq .
curl -s "$BASE/api/v1/counties?limit=100"          -H "Authorization: Bearer $API_KEY" | jq '.data | length'
curl -s "$BASE/api/v1/schools?limit=100"           -H "Authorization: Bearer $API_KEY" | jq '.pagination.total'
curl -s "$BASE/api/v1/performance?limit=1"         -H "Authorization: Bearer $API_KEY" | jq '.data[0]'
curl -s "$BASE/api/v1/performance?indicator_id=4&academic_year=2023-24&limit=5" \
     -H "Authorization: Bearer $API_KEY" | jq .
```

Expected:

- `/api/platform/stats` shows `counties: 58`, `schools: ~10000`, `dataPoints: ~800000+`.
- `/api/v1/counties` returns 58 rows (paginated).
- `/api/v1/performance` returns real values with `status_text` and `color` populated.

---

## 5. Rollback

If verification (step 3) or smoke tests (step 4) fail:

**Staging-schema approach:**
```sql
BEGIN;
ALTER SCHEMA public RENAME TO public_failed_<timestamp>;
ALTER SCHEMA public_old_<timestamp> RENAME TO public;
COMMIT;
```

**pg_dump approach:**
```bash
# destructive — only run if you're certain rollback is required
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pg_restore --dbname="$DATABASE_URL" pre-reingest-YYYY-MM-DD.dump
```

Post-mortem: open a ticket linking the `data_ingestion_logs` rows for the failed run, the
snapshot id, and the specific verification query that failed. Do not attempt a second run
until the root cause is understood.

---

## 6. Post-run cleanup

- Drop the `public_old_<timestamp>` schema after 24-72 hours.
- Confirm the alerting webhook fired (or didn't fire) as expected for a clean run.
- Update `data_ingestion_logs` retention policy: keep the last 180 days, archive older.
- Note the run in a `CHANGES.md` or the operator wiki with: date, who ran it, snapshot id,
  duration, final row counts.

---

## 7. Cadence going forward

Once P2-H (scheduled ingestion via job queue) is in place, this runbook becomes the
procedure for **manual** re-runs only. The steady state is:

- CDE publishes new data annually (usually October/November).
- Job queue triggers a weekly no-op check (`HEAD` on each source URL, `Last-Modified`
  compared to last successful ingest in `data_ingestion_logs`).
- On change detected, the staging-schema swap pipeline runs automatically, verification
  queries run automatically, swap happens only if all acceptance criteria pass.
- Alert fires on any failure, reverting to this manual runbook.

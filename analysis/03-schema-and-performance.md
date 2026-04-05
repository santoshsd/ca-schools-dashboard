# 03 — Database Schema & Query Performance

Primary files:
- `shared/schema.ts` (174 lines)
- `shared/models/auth.ts` (30 lines)
- `server/db.ts`
- `drizzle.config.ts`

---

## CRITICAL (data integrity)

### SCHEMA-01 · `api_keys.user_id` and `api_usage_logs.user_id` lack foreign keys
**File:** `shared/schema.ts:110, 123`

```ts
export const apiKeys = pgTable("api_keys", {
  // ...
  userId: varchar("user_id").notNull(),  // no .references(() => users.id)
  // ...
});

export const apiUsageLogs = pgTable("api_usage_logs", {
  // ...
  userId: varchar("user_id").notNull(),  // no .references(() => users.id)
  // ...
});
```

An API key (or usage log) can reference a user id that has been deleted. Drizzle's
`relations()` at the type level is unaware of this, so `db.query.apiKeys.findMany({ with:
{ user: true } })` silently hides orphaned rows. In practice this means compliance deletions
are unsafe: "forget me" deletes `users` but leaves `api_keys` and `api_usage_logs` dangling.

**Fix:** add `.references(() => users.id, { onDelete: "cascade" })` (or `restrict`, if you
want deletion to fail loudly on active keys). Write a migration + a data-cleanup step for
existing orphans.

### SCHEMA-02 · `performance_data` has no CHECK constraint enforcing reporting level
**File:** `shared/schema.ts:73-98`

```ts
schoolId:   integer("school_id").references(() => schools.id),
districtId: integer("district_id").references(() => districts.id),
countyId:   integer("county_id").references(() => counties.id),
```

All three are nullable and the ingestion code (`ingest-cde-data.ts:330-353`) is expected to
set exactly one based on `reporting_level`. There is no database-level constraint enforcing
this. A bad ingest could produce rows with all three NULL (state-level), all three set, or
zero matching `reporting_level` — queries aggregating by level would double-count or miss.

**Fix:** add a CHECK constraint via Drizzle migration:

```sql
ALTER TABLE performance_data ADD CONSTRAINT performance_data_level_consistent CHECK (
  (reporting_level = 'school'   AND school_id IS NOT NULL AND district_id IS NOT NULL AND county_id IS NOT NULL) OR
  (reporting_level = 'district' AND school_id IS NULL     AND district_id IS NOT NULL AND county_id IS NOT NULL) OR
  (reporting_level = 'county'   AND school_id IS NULL     AND district_id IS NULL     AND county_id IS NOT NULL) OR
  (reporting_level = 'state'    AND school_id IS NULL     AND district_id IS NULL     AND county_id IS NULL)
);
```

### SCHEMA-03 · `performance_data` has no natural unique key
**File:** `shared/schema.ts:73-98`

No unique constraint on the dedupe key
`(school_id, district_id, county_id, indicator_id, student_group_id, academic_year, reporting_level)`.

Combined with `ingest-cde-data.ts:382, 508` (plain inserts), re-running ingestion after a
partial failure either blows up on a later unique violation (if one is added) or silently
doubles rows (today's reality, because there is no constraint).

**Fix:** add a unique partial index (because nullability differs by reporting level):

```sql
CREATE UNIQUE INDEX performance_data_dedupe_school
  ON performance_data (school_id, indicator_id, student_group_id, academic_year)
  WHERE reporting_level = 'school';
CREATE UNIQUE INDEX performance_data_dedupe_district
  ON performance_data (district_id, indicator_id, student_group_id, academic_year)
  WHERE reporting_level = 'district';
CREATE UNIQUE INDEX performance_data_dedupe_county
  ON performance_data (county_id, indicator_id, student_group_id, academic_year)
  WHERE reporting_level = 'county';
CREATE UNIQUE INDEX performance_data_dedupe_state
  ON performance_data (indicator_id, student_group_id, academic_year)
  WHERE reporting_level = 'state';
```

---

## HIGH

### SCHEMA-04 · Foreign keys lack `onDelete`
**File:** `shared/schema.ts:24, 37-38, 75-79, 122`

```ts
countyId: integer("county_id").notNull().references(() => counties.id),
```

Default Postgres behaviour is `NO ACTION`, which is effectively `RESTRICT`. That's actually
*safe* for static reference data (you can't delete a county while districts exist), but for
`api_usage_logs.apiKeyId → api_keys.id` you probably want `CASCADE` so deactivating a key
and later purging it removes its usage history. Every FK should be an explicit policy
decision.

### SCHEMA-05 · `users.email` is `unique()` but nullable
**File:** `shared/models/auth.ts:20`

```ts
email: varchar("email").unique(),
```

Postgres treats multiple NULLs as distinct under `UNIQUE`, so multiple rows with `email=NULL`
are allowed. `server/auth-adapter.ts:54-57` relies on email uniqueness for registration —
but if registration ever admits a nullable email path (e.g. SSO without email claim), this
silently breaks.

**Fix:** decide whether email is mandatory (`notNull()`) or use a partial unique index
`CREATE UNIQUE INDEX users_email_unique ON users (email) WHERE email IS NOT NULL`.

### SCHEMA-06 · Missing composite index on `performance_data`
**File:** `shared/schema.ts:91-98`

Current indexes are single-column:

```ts
index("idx_perf_school").on(table.schoolId),
index("idx_perf_district").on(table.districtId),
index("idx_perf_county").on(table.countyId),
index("idx_perf_indicator").on(table.indicatorId),
index("idx_perf_year").on(table.academicYear),
index("idx_perf_group").on(table.studentGroupId),
```

The hottest API query (`storage.getPerformanceData`, called from `routes.ts:172-192`) filters
by combinations like `school_id AND academic_year AND indicator_id`. Postgres can't combine
single-column indexes efficiently for high-cardinality filters on a table expected to hold
~1 M rows.

**Fix:** add composite indexes matching the real query patterns, e.g.

```ts
index("idx_perf_school_year_indicator").on(table.schoolId, table.academicYear, table.indicatorId),
index("idx_perf_district_year_indicator").on(table.districtId, table.academicYear, table.indicatorId),
index("idx_perf_indicator_group_year").on(table.indicatorId, table.studentGroupId, table.academicYear),
```

Drop redundant single-column indexes once the composites are in place.

### SCHEMA-07 · No index on `api_usage_logs.createdAt` in combination with `apiKeyId`
**File:** `shared/schema.ts:129-133`

```ts
index("idx_usage_key").on(table.apiKeyId),
index("idx_usage_user").on(table.userId),
index("idx_usage_created").on(table.createdAt),
```

The `/api/usage` endpoint (`routes.ts:259-271`) queries by `(userId, createdAt > X)` with a
time-range filter — this benefits from a composite `(user_id, created_at DESC)` index. As
the usage table grows, single-column indexes degrade quickly.

### SCHEMA-08 · `sessions` table has no TTL cleanup job
**File:** `shared/models/auth.ts:6-14`

`connect-pg-simple` by default doesn't prune expired sessions; rows grow forever.
`IDX_session_expire` exists but no cron purges rows where `expire < now()`.

**Fix:** enable `pruneSessionInterval` on `connect-pg-simple` or run a daily cleanup query.

---

## MEDIUM

### SCHEMA-09 · `user_passwords` table is created by raw DDL at runtime
**File:** `server/auth-adapter.ts:73-75`

```ts
await db.execute(
  `CREATE TABLE IF NOT EXISTS user_passwords (user_id VARCHAR PRIMARY KEY REFERENCES users(id), password_hash TEXT NOT NULL)`
);
```

Every registration attempt runs this DDL. It should live in `shared/schema.ts` + a
migration, with a real Drizzle table definition and type. The current layout also means
`drizzle-kit` doesn't know about this table and will never generate a diff for it.

### SCHEMA-10 · `value` is `real` (float4), not `numeric`
**File:** `shared/schema.ts:81`

```ts
value: real("value"),
```

`real` is a 4-byte IEEE-754 float. Percentages like 93.4% round to 93.40000152587891.
Aggregate queries (averages across thousands of rows) accumulate float error. Use
`numeric(6,3)` for percentages.

### SCHEMA-11 · No `createdAt`/`updatedAt` on reference tables
**File:** `shared/schema.ts:9, 20, 33, 58, 66`

`counties`, `districts`, `schools`, `indicators`, `student_groups` have no timestamp columns.
There is no way to tell a client "this school record was last refreshed on 2026-03-01" or
to quickly find schools that changed since the last ingest.

**Fix:** add `createdAt: timestamp("created_at").defaultNow().notNull()` and
`updatedAt: timestamp("updated_at").defaultNow().notNull()` with a trigger or an
application-level bump.

### SCHEMA-12 · `api_keys.keyPrefix` column is 12 chars, code writes 11
**File:** `shared/schema.ts:113`, `server/routes.ts:214`

Harmless today; just keep them consistent (`prefix = "csd_" + 8 hex = 12 chars` is more
robust).

### SCHEMA-13 · Indexes on unique columns are implicit but the code calls them "indexes"
**File:** `shared/schema.ts:11, 22, 35, 60, 68`

`.unique()` creates an implicit btree index automatically, so there is no missing index on
`counties.code`, `districts.code`, `schools.code`, etc. This is a *correction* to an earlier
gut-check — the lookups `getCountyByCode`, `getDistrictByCode`, `getSchoolByCode` in
`server/storage.ts` are already fast. Leaving this note so reviewers don't add duplicate
indexes.

---

## LOW

### SCHEMA-14 · `students_groups.category` is nullable with no default
Most rows get "Race/Ethnicity"/"Program"/"Gender"/"All" from the ingestion code. Consider
`notNull()` with a `default("Other")`.

### SCHEMA-15 · `data_ingestion_logs.status` is a free-text varchar
Values come from code as `"completed"|"error"|"checking"|"partial"`. Make it a Postgres
enum or a `CHECK` constraint so typos are caught at write time.

### SCHEMA-16 · `api_usage_logs` has no retention policy
A busy API produces millions of rows. Add a monthly partition or a retention job
(e.g. `DELETE FROM api_usage_logs WHERE created_at < now() - interval '90 days'`).

---

## Query performance notes (from live site)

The live API responses are fast today (~140 ms for `/api/v1/performance`) precisely because
the DB is nearly empty (see INGEST-01). Projected load for a full dataset:

- `performance_data`: ~1.2 M rows (10 k schools × 7 indicators × 18 student groups × 2 years,
  minus non-reported combinations).
- `schools`: ~10 k rows.
- `api_usage_logs`: unbounded.

With SCHEMA-06 composite indexes in place, p95 for the hottest queries should stay under
100 ms even at full volume. Without them, `/api/v1/performance?school_id=X` degrades to a
sequential scan across all years/indicators/groups for that school — a few hundred
milliseconds each, with fan-out risk.

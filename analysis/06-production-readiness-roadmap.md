# 06 — Production-Readiness Roadmap

This document translates the findings from docs 01-05 into a prioritised plan for turning
the portal into something suitable for public release. The three tiers below are ordered by
*what would cause a production incident on day one* (P0), *what makes the platform
trustworthy enough to publish* (P1), and *what differentiates it as a good developer
product* (P2).

---

## P0 — Must fix before any public launch

These are correctness/security issues that will cause an incident shortly after launch.

### P0-A · Stop destroying production data on every ingest
- **What:** INGEST-01, INGEST-02, INGEST-03.
- **Action:** wrap `runFullIngestion` in a transaction, make every insert idempotent
  (`onConflictDoUpdate`), write per-batch failures to `data_ingestion_logs`, mark
  partial runs as `partial`/`error` not `completed`. Prefer staging-schema-and-swap over a
  single long-running transaction to avoid holding locks across minutes.
- **Why first:** the live DB already shows this bug in production (16 counties / 20 schools).

### P0-B · Switch password hashing to argon2id
- **What:** SEC-02.
- **Action:** `npm i argon2`, replace `createHash("sha256")` in `server/auth-adapter.ts`
  with `argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2 })`,
  add a "hash upgrade on login" path so existing users migrate transparently.

### P0-C · Move `user_passwords` into the schema + parameterise SQL
- **What:** SEC-01, SCHEMA-09.
- **Action:** define `userPasswords` in `shared/schema.ts`, generate a drizzle migration,
  replace raw `db.execute` interpolations with the query builder.

### P0-D · Input validation on every query parameter
- **What:** SEC-04.
- **Action:** Zod-schema each handler's `req.query` / `req.params`. Use `z.coerce.number().int().min(...).max(...)` rather than `parseInt || fallback`.

### P0-E · Rate limiting on auth + write endpoints
- **What:** SEC-05, SEC-10.
- **Action:** `express-rate-limit` (already in the allow-list but never imported). Tight
  limits on `/api/auth/*` (e.g. 10/min/IP) and `/api/keys` (e.g. 5/hour/user). Looser
  limits on `/api/v1/*` keyed by API-key id.

### P0-F · Restrict unauthenticated data-count endpoints
- **What:** SEC-03.
- **Action:** add a minimal public `/api/healthz` returning only `{status:"ok"}`; move the
  count-bearing `/api/health` behind auth; decide whether `/api/platform/stats` stays
  public (it feeds the marketing page) — if yes, cache it aggressively.

### P0-G · Fix the SPA catch-all for `/api/*`
- **What:** UI-04.
- **Action:** register the catch-all *only* for non-`/api` paths; return JSON 404 for
  unknown API routes.

### P0-H · Start-up environment validation
- **What:** SEC-08.
- **Action:** Zod-parse `process.env` at boot (`DATABASE_URL`, `SESSION_SECRET` min-length
  32, `NODE_ENV`). Fail fast on missing/invalid values.

### P0-I · Re-ingest the data
- **What:** Once P0-A has landed, re-ingest via the runbook in
  [`07-reingest-runbook.md`](./07-reingest-runbook.md).

---

## P1 — Trustworthy public launch

These items aren't user-visible bugs but their absence makes the platform unsafe to
publish and support.

### P1-A · Schema integrity constraints
- **Actions:** SCHEMA-01 (FKs on `api_keys.user_id`, `api_usage_logs.user_id`), SCHEMA-02
  (CHECK on `performance_data` reporting level), SCHEMA-03 (unique dedupe indexes),
  SCHEMA-04 (explicit `onDelete` policy on every FK), SCHEMA-05 (resolve nullable unique on
  `users.email`), SCHEMA-10 (change `real` → `numeric(6,3)` for percentages).

### P1-B · Composite indexes for hot queries
- **Action:** SCHEMA-06 / SCHEMA-07. Add composite indexes matching the patterns in
  `storage.getPerformanceData` and `storage.getApiUsageStats`.

### P1-C · CORS, helmet, standard security headers
- **Actions:** SEC-06, SEC-07. `app.use(helmet(...))`, `app.use(cors({origin: allowList}))`.
  Add HSTS, CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.

### P1-D · OpenAPI 3 spec served at `/openapi.json`
- **Actions:** SEC-15. Generate from Zod via `zod-to-openapi` or similar, mount Swagger UI
  at `/docs/api`. The `client/src/pages/docs.tsx` hardcoded reference then becomes derived.

### P1-E · Standardised error envelope + structured logging
- **Actions:** SEC-14, SEC-16. Single `{error:{code,message,details?}}` shape, pino-based
  structured logging with request ids, no stack traces in production responses.

### P1-F · API-key lifecycle
- **Actions:** SEC-09 (default expiry ~1 year), SEC-10 (per-user cap ~20 active),
  SCHEMA-01 (cascade delete), SEC-24 (audit log for deactivation), rotate endpoint + UI
  warning at 30 days to expiry.

### P1-G · Ingestion observability + alerting
- **Actions:** INGEST-02 (error rows with sample + stack), INGEST-05/INGEST-06 (abort on
  latest-year failure, discover years dynamically), INGEST-13 (honest user-agent), plus a
  webhook (Slack or email) on any ingestion run that ends `error`/`partial` or that
  produces a row count outside expected bounds.

### P1-H · Database hygiene
- **Actions:** SCHEMA-08 (session cleanup cron), SCHEMA-16 (`api_usage_logs` retention job
  at 90 days, or monthly partitions), nightly `VACUUM ANALYZE` on the big tables.

### P1-I · React client resilience
- **Actions:** UI-01 (error states), UI-02 (fix React Query defaults), UI-03 (fix
  queryKey join), UI-05 (show server error bodies in Explorer), UI-15 (top-level error
  boundary).

### P1-J · CI/CD
- **Actions:** GitHub Actions running `tsc --noEmit`, eslint, a small vitest suite covering
  the ingestion parser + auth adapter, and `drizzle-kit push --dry` on PRs. Deploy on
  merge-to-main via whichever host replaces Replit (P2-F).

---

## P2 — Differentiators for public-facing developer platform

Items that move the product from "it works" to "people want to build on it".

### P2-A · API caching layer
- ETag + `max-age` on truly public read endpoints (`/api/v1/indicators`,
  `/api/v1/student-groups`, paginated counties). `X-Data-Last-Updated` header carrying the
  most-recent successful ingestion timestamp so clients can key their own caches.

### P2-B · Language SDKs
- Generate a JavaScript/TypeScript and Python client from the OpenAPI spec. Publish to npm
  and PyPI under `ca-schools-sdk`. The explorer page should include "copy this snippet"
  buttons.

### P2-C · Quickstart docs, recipes, examples
- "Get an API key in 60 seconds", "list schools in my county", "compare graduation rates
  across student groups". Embedded runnable code blocks.

### P2-D · Tiered rate-limit plans
- Anonymous: 10 req/min via a demo key, no PII.
- Registered (free): 1,000 req/hour, 20 keys max.
- Waitlisted (higher): upon request. Rate limits keyed by API key id + plan id; plan stored
  on `api_keys` or on a new `plans` table.

### P2-E · Operator dashboard
- A `/admin` route behind a role flag showing recent ingestion runs, errors, per-endpoint
  p95 latencies (from `api_usage_logs`), and a "trigger ingestion" button that enqueues a
  job in the background worker. Protect with admin RBAC (new `users.role` column) + 2FA.

### P2-F · Move off Replit for production
- Replit is convenient for development; for a public API it's not ideal (cold starts,
  unclear SLA, no staging). Target: Fly.io / Render / Azure Container Apps. The
  `Dockerfile` already exists; mostly it's a matter of wiring a managed Postgres,
  secrets, domain, and deploy pipeline.

### P2-G · Observability stack
- Grafana Cloud / Datadog / self-hosted Prometheus + Loki. Dashboards: ingestion run
  success/fail, row-count drift, p95 latency per endpoint, auth failure rates, API-key
  usage top-N.

### P2-H · Scheduled ingestion via a job queue
- Replace the ad-hoc ingestion scripts with a cron/worker (BullMQ, pg-boss, or GitHub
  Actions on a schedule that kicks a webhook). Idempotent, observable, retryable.

### P2-I · Data provenance and attribution
- Each API response includes a `source` section citing the underlying CDE file
  (url + snapshot date). The `/docs` page cites the upstream dashboardresources.asp page
  and explains the processing steps. Transparent processing is a requirement for public
  education data and helps avoid compliance questions.

### P2-J · Privacy / terms
- Terms of service + privacy policy + acceptable-use on the landing page. Clear statement
  that this is unofficial and not affiliated with CDE.

---

## Cross-cutting tests to write

Even without a full test suite today, these are the smallest set of tests that would catch
the *class* of bugs in this review:

1. **Ingestion transaction test:** inject a fake fetch failure mid-run, assert the DB row
   counts are unchanged from before the run started.
2. **Ingestion idempotency test:** run the ingest twice with the same fixture TSV, assert
   row counts are identical the second time.
3. **`parseInt` route test:** hit `/api/v1/counties?limit=abc`, assert 400 with an error
   message naming `limit`.
4. **Password hash test:** register a user, hash begins with `$argon2id$`.
5. **SQL injection test:** attempt a registration with a crafted email containing `';--`,
   assert no rows outside the single expected user are created.
6. **Catch-all test:** `GET /api/no-such-endpoint`, assert 404 + JSON content-type.
7. **Rate-limit test:** 11 requests to `/api/auth/login` in a minute, assert the 11th is 429.

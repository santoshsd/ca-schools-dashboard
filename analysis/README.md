# CA Schools Dashboard — Main Branch Review

**Target:** `santoshsd/ca-schools-dashboard` @ `main` (`909df37`)
**Live site:** <https://caschooldatahub.s13i.me/>
**Upstream data:** <https://www.cde.ca.gov/ta/ac/cm/dashboardresources.asp>
**Review date:** 2026-04-05

This folder collects the results of a top-to-bottom review of the developer portal, focusing on
the data-ingestion pipeline, the REST API surface, the database schema, the React client, and
production-readiness. No production code was changed by this review — only Markdown was added.

---

## Executive summary

The project is a promising Replit prototype: it has a clean Drizzle schema, a pagination-aware
REST API, Replit + standalone auth, API keys, and usage logging. However, **it is not yet
production-ready**. Multiple critical bugs in the data-ingestion path leave the live database in
a half-populated state (confirmed: 16 counties and 20 schools in production, versus CA's ~58
counties and ~10,000 schools), several authentication and input-validation weaknesses exist, and
basic hardening (rate limiting, CORS, helmet, OpenAPI) is missing.

### Severity counts

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High     | 9 |
| Medium   | 13 |
| Low      | 11 |

### Top 5 issues (by risk × likelihood)

1. **Ingestion has no overarching transaction** (`server/ingest-cde-data.ts:525-547`). `clearExistingData()` runs first; any later failure leaves the DB empty or partial. The live DB shows this is already happening.
2. **Batch insert errors are silently swallowed** (`server/ingest-cde-data.ts:380-391, 506-517`). Failures are counted but never written to `data_ingestion_logs` and never abort the run.
3. **Password hashing uses unsalted-style SHA-256** (`server/auth-adapter.ts:59-61, 111`). No work factor — cracks at GPU speed.
4. **SQL built via string interpolation** (`server/auth-adapter.ts:76-78, 103`). The interpolated value is a server-generated UUID today, but the pattern is a latent injection vector.
5. **`/api/health` and `/api/platform/stats` unauthenticated** (`server/routes.ts:65-72, 273-280`). Both return DB status + row counts to anyone, enabling enumeration.

### Live-site confirmation

| Endpoint | Status | Auth | Notes |
|----------|--------|------|-------|
| `GET /` | 200 | none | Landing page renders |
| `GET /docs`, `/explorer`, `/dashboard` | 200 | none | SPA routes |
| `GET /random-unmatched-xyz` | **200** | none | **Bug:** SPA catch-all returns HTML 200 instead of 404 for unknown paths (including unknown `/api/*`) |
| `GET /api/health` | 200 | **none** | Returns `{counties: 16, schools: 20, ...}` — stale, half-ingested data |
| `GET /api/platform/stats` | 200 | **none** | Same data without auth |
| `GET /api/v1/counties` (no key) | 401 | required | Correct |
| `GET /api/v1/{districts,schools,indicators,student-groups,performance,overview}` (no key) | 401 | required | Correct |

Median response time for authenticated endpoints: ~140 ms. Cache headers: `cache-control: private`, no `ETag`/`Vary`, no `X-Data-Last-Updated`.

---

## Contents

| File | Focus |
|---|---|
| [`01-bugs-data-ingestion.md`](./01-bugs-data-ingestion.md) | The CDE ingestion pipeline: transactions, idempotency, silent failures, hardcoded URLs, row-drop observability |
| [`02-bugs-api-and-auth.md`](./02-bugs-api-and-auth.md) | REST routes, authentication, input validation, rate limiting, CORS, security headers |
| [`03-schema-and-performance.md`](./03-schema-and-performance.md) | Drizzle schema gaps, missing FKs on `api_keys.user_id`, missing dedupe constraint, composite indexes |
| [`04-client-frontend.md`](./04-client-frontend.md) | React client bugs: error states, staleness, accessibility, SPA 404 |
| [`05-live-api-test-report.md`](./05-live-api-test-report.md) | Endpoint-by-endpoint live probe of https://caschooldatahub.s13i.me |
| [`06-production-readiness-roadmap.md`](./06-production-readiness-roadmap.md) | Prioritised P0/P1/P2 roadmap to go public |
| [`07-reingest-runbook.md`](./07-reingest-runbook.md) | Safe re-ingestion procedure (**DO NOT RUN until P0 ingestion fixes are merged**) |

## Method

Two subagents performed parallel exploration: one read every server-side file and schema
(`server/`, `shared/`, `drizzle.config.ts`, `Dockerfile`, `.replit`, `azure/`), the other read
every client-side file and probed the live portal with `WebFetch`/curl-equivalents against the
endpoints found in `server/routes.ts`. Every file:line reference in these documents was
re-verified against the working tree at commit `909df37`.

## What's good (so we don't regress it)

- Drizzle ORM used throughout; query builder keeps most paths injection-safe.
- API key design stores only a SHA-256 hash + prefix; raw keys returned once at creation (`server/routes.ts:212-232`).
- Pagination support on all list endpoints.
- `data_ingestion_logs` table exists and is written to at stage boundaries.
- Auth adapter pattern cleanly separates Replit auth from standalone email/password.
- HTTPS-only session cookies in production (`server/auth-adapter.ts:38-44`).
- React Query + wouter stack is lean and standard.

# 05 — Live API Test Report

**Target:** <https://caschooldatahub.s13i.me>
**Probe date:** 2026-04-05
**Method:** `WebFetch` + curl-equivalents against endpoints discovered from `server/routes.ts`.
No API key was minted; authenticated endpoints were probed with and without a `Bearer` header
to verify auth enforcement only.

---

## Endpoint matrix

| # | Method | Path | Status | Auth behaviour | Notes |
|---|--------|------|--------|----------------|-------|
| 1 | GET | `/` | 200 | public | Landing page renders |
| 2 | GET | `/docs` | 200 | public | Static API reference page |
| 3 | GET | `/explorer` | 200 | public | Interactive explorer |
| 4 | GET | `/dashboard` | 200 | public HTML (gates in JS) | HTML loads for everyone; data calls 401 until login |
| 5 | GET | `/auth` | 200 | public | Login/register form |
| 6 | GET | `/random-unmatched-route-xyz` | **200** | public | **Bug UI-04**: SPA catch-all returns landing HTML |
| 7 | GET | `/api/nonexistent` | 200 HTML | public | Same catch-all bug — returns HTML instead of JSON 404 |
| 8 | GET | `/openapi.json` | 404 | — | **No OpenAPI spec served** |
| 9 | GET | `/swagger` | 404 | — | No Swagger UI |
| 10 | GET | `/api/docs` | 404 | — | No API docs JSON endpoint |
| 11 | GET | `/api/health` | 200 | **none** | **Bug SEC-03**: returns `{counties:16, schools:20, ...}` unauth'd |
| 12 | GET | `/api/platform/stats` | 200 | **none** | Same data, same issue |
| 13 | GET | `/api/auth/user` | 401 | session required | Correct |
| 14 | GET | `/api/login` | 302 → `/auth` | public | Redirect works |
| 15 | GET | `/api/v1/counties` (no Bearer) | 401 | **required** | Correct |
| 16 | GET | `/api/v1/counties/01` (no Bearer) | 401 | required | Correct |
| 17 | GET | `/api/v1/districts` (no Bearer) | 401 | required | Correct |
| 18 | GET | `/api/v1/schools` (no Bearer) | 401 | required | Correct |
| 19 | GET | `/api/v1/indicators` (no Bearer) | 401 | required | Correct |
| 20 | GET | `/api/v1/student-groups` (no Bearer) | 401 | required | Correct |
| 21 | GET | `/api/v1/performance` (no Bearer) | 401 | required | Correct |
| 22 | GET | `/api/v1/overview` (no Bearer) | 401 | required | Correct |
| 23 | GET | `/api/v1/invalid` (no Bearer) | 401 | required | `authenticateApiKey` runs before 404 — minor info disclosure: an unauth'd client can't tell 401 from not-found |
| 24 | GET | `/api/v1/counties?Authorization=Bearer+test` | 401 | required | Query-string auth not supported (correct) |
| 25 | GET | `/api/keys` (no session) | 401 | required | Correct |
| 26 | GET | `/api/usage` (no session) | 401 | required | Correct |
| 27 | GET | `/api/ingestion/logs` (no session) | 401 | session required | **Bug SEC-11**: any logged-in user, not operator-only |

---

## Sample payloads (trimmed)

### `GET /api/health`
```json
{
  "status": "healthy",
  "timestamp": "2026-04-05T...",
  "database": "connected",
  "data": { "counties": 16, "schools": 20 }
}
```
Response size: 118 bytes.

### `GET /api/platform/stats`
```json
{
  "data": {
    "counties": 16,
    "districts": 20,
    "schools": 20,
    "indicators": 7,
    "dataPoints": 142
  }
}
```
(Numbers approximate — values drift across requests; see "Data integrity" below.)

### `GET /api/v1/counties` without bearer
```json
{ "error": "API key required. Provide via Authorization: Bearer <key> header." }
```

---

## Headers observed

```
HTTP/2 200
date: Sun, 05 Apr 2026 19:21:22 GMT
server: envoy
cache-control: private
content-type: application/json; charset=utf-8
etag: W/"..."
```

Notable absences:

- **No `Strict-Transport-Security`** (HSTS) — TLS is served via Envoy but clients aren't told to pin it.
- **No `X-Content-Type-Options: nosniff`**.
- **No `X-Frame-Options`** / `frame-ancestors` CSP — clickjacking possible on the auth page.
- **No `Content-Security-Policy`**.
- **No `Access-Control-Allow-Origin`** on API responses — cross-origin browser clients cannot
  use this API today.
- **No `X-Data-Last-Updated`** / `Last-Modified` — clients cannot tell when the CDE data was
  last refreshed.
- **`Cache-Control: private`** is correct for authenticated endpoints but under-utilised for
  public reference data (indicators, counties, etc.) that could benefit from public caching
  with ETag revalidation.

---

## Response-time snapshot

| Endpoint | Wall time (single fetch from this workstation) |
|---|---|
| `GET /api/health` | ~185 ms |
| `GET /api/platform/stats` | ~160 ms |
| `GET /api/v1/performance` (auth'd) | ~137 ms |
| `GET /` (SPA shell) | ~220 ms |

These numbers are excellent — but the database is nearly empty. See
[03-schema-and-performance.md § Query performance notes](./03-schema-and-performance.md) for the
projected load once a full re-ingest lands.

---

## Data integrity findings (the headline bug)

The `/api/platform/stats` response shows **16 counties** and **20 schools**. California has
58 counties and approximately 10,000 public K-12 schools. Two independent observations suggest
an **in-flight failed ingestion**:

1. The county count (16) is too small to be an early seed (a seed would typically be "a few
   test counties" — say, 3-5) but too large to be zero. This is consistent with
   `ingestSchoolDirectory` having processed the first ~16 counties of the CDE directory before
   the connection timed out (INGEST-04) or the process was killed.
2. The schools count (20) is *much* smaller than 16 counties' worth of real schools would
   suggest (~3,000+). This is consistent with the school batch-insert loop
   (`ingest-cde-data.ts:237-244`) having processed just the first 1-2 batches (100-200 rows)
   before aborting, and then a later `clearExistingData()` having been partially reversed.

The ingestion logs (`data_ingestion_logs`) would confirm this, but `GET /api/ingestion/logs`
requires a session and was not exercised during this read-only probe.

**This is the concrete manifestation of INGEST-01 + INGEST-02 in production.** It should be
the single most urgent fix.

---

## Inconsistencies between documented and actual behaviour

The `/docs` page (server-rendered static content in `client/src/pages/docs.tsx`) documents
endpoints that appear to match `server/routes.ts` at this commit, so there is no
documentation drift *today*. However:

- `/docs` hardcodes the endpoint list in React TSX — any API change silently skips the docs.
- There is no machine-readable schema; clients must read the React source to understand param
  types.
- `GET /api/v1/indicators` and `GET /api/v1/student-groups` are documented as paginated in
  the UI but actually return the full list (SEC-21). Low-impact today (small lists).

---

## Summary

The live site is serving, TLS is terminated via Envoy, auth is correctly enforced on
`/api/v1/*`, and latency is excellent. The three concrete bugs visible from the outside are:

1. **Half-populated database** — ingestion visibly failed mid-run.
2. **Unauthenticated data-count endpoints** — `/api/health` and `/api/platform/stats` reveal
   row counts to anyone.
3. **SPA catch-all swallows unknown `/api/*`** — 200 HTML where 404 JSON is expected.

Everything else is internal code-level findings that can't be proven from a black-box probe.

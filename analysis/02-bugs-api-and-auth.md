# 02 — REST API, Authentication & Security

Primary files:
- `server/routes.ts` (293 lines)
- `server/auth-adapter.ts` (170 lines)
- `server/index.ts`
- `server/db.ts`

---

## CRITICAL

### SEC-01 · SQL built by string interpolation in the auth adapter
**File:** `server/auth-adapter.ts:73-78, 103`

```ts
await db.execute(
  `CREATE TABLE IF NOT EXISTS user_passwords (user_id VARCHAR PRIMARY KEY REFERENCES users(id), password_hash TEXT NOT NULL)`
);
await db.execute(
  `INSERT INTO user_passwords (user_id, password_hash) VALUES ('${user.id}', '${passwordHash}') ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`
);
// ...
const result = await db.execute(`SELECT password_hash FROM user_passwords WHERE user_id = '${user.id}'`);
```

Today `user.id` is a server-generated UUID (`users.id` column default
`gen_random_uuid()`, `shared/models/auth.ts:19`) and `passwordHash` is a crypto-random-hex
string — so exploitation requires a separate vulnerability first. But:

- Any future change that lets user-controlled data flow into `user.id` (e.g. import tool,
  legacy id import) becomes an immediate injection.
- The `passwordHash` interpolation is also doubly dangerous because the hash format
  `${salt}:${hash}` happens to only contain hex + `:`, but Drizzle's `db.execute` happily
  accepts whatever string you hand it — a contributor who changes the hash format (e.g. adds
  argon2 parameter strings containing `$`) could unknowingly break the query or, worse, open
  a hole.
- Creating tables at request time (line 73-75) is also a smell — this should live in a
  migration (`drizzle-kit generate`).

**Fix:** use the Drizzle query builder (`db.insert(userPasswords).values({...})`), define
the `user_passwords` table in `shared/schema.ts`, create a migration, and never interpolate
into raw SQL.

### SEC-02 · Passwords are "hashed" with unsalted-style SHA-256
**File:** `server/auth-adapter.ts:59-61, 111`

```ts
const salt = randomBytes(16).toString("hex");
const hash = createHash("sha256").update(password + salt).digest("hex");
const passwordHash = `${salt}:${hash}`;
// ...
const attemptHash = createHash("sha256").update(password + salt).digest("hex");
```

A per-user salt is present but there is **no work factor**. SHA-256 is designed to be fast;
a consumer GPU cracks it at ~10^10 hashes/sec. For an 8-character password drawn from a
realistic keyspace this is minutes. Any database leak is a full credential breach.

**Fix:** switch to `argon2id` (`argon2` package) with sensible parameters
(`memoryCost: 19456, timeCost: 2, parallelism: 1`), or `bcrypt` (cost 12). Add a password
policy: minimum length 12, reject the 10k most common passwords (HIBP-style).

### SEC-03 · `/api/health` and `/api/platform/stats` are unauthenticated and leak data counts
**File:** `server/routes.ts:65-72, 273-280`

```ts
app.get("/api/health", async (_req, res) => {
  const stats = await storage.getOverviewStats();
  res.json({ status: "healthy", ..., data: { counties: stats.counties, schools: stats.schools } });
});
// ...
app.get("/api/platform/stats", async (req, res) => {
  const stats = await storage.getOverviewStats();
  res.json({ data: stats });
});
```

Both endpoints are mounted without `authenticateApiKey` / `isAuthenticated`. They reveal:
- database connectivity,
- exact counts of counties, districts, schools, indicators, data points.

These counts are used on the public landing page (`client/src/pages/landing.tsx:13-15`), so
removing them breaks the marketing page. But the health endpoint in particular should not
double as a data-volume oracle.

**Fix:**
- Keep `GET /api/healthz` as a minimal public endpoint returning only `{status:"ok"}` (or
  `unhealthy`).
- Move `/api/health` with DB counts under auth, or make it an operator-only endpoint.
- Keep `/api/platform/stats` public **only if** that's an intentional product decision, and
  cache the response aggressively (ETag + 5 minute `max-age`) to prevent it being used as a
  probe.

---

## HIGH

### SEC-04 · `parseInt` on query params with `|| fallback` is not validation
**File:** `server/routes.ts:79-80, 103-105, 129-132, 175-183, 251, 262`

```ts
const limit  = Math.min(parseInt(req.query.limit as string) || 100, 500);
const offset = parseInt(req.query.offset as string) || 0;
```

Problems:
- `parseInt("12abc")` returns `12`. Silent partial parse, no 400 error.
- `parseInt("abc")` returns `NaN`, and `NaN || 100` is `100`. The fallback masks bad input.
- `parseInt("-500")` returns `-500`, which passes `Math.min(-500, 500) === -500` and flows
  into `storage.getCounties(-500, ...)`. Depending on the driver this may throw or, worse,
  silently succeed with no rows.
- `offset` is unbounded — `offset=9999999999` forces a slow table scan, enabling a cheap DoS.
- `parseInt(req.params.id)` in `DELETE /api/keys/:id` (line 251) has zero validation.

**Fix:** validate every query param with a Zod schema:

```ts
const listQuery = z.object({
  limit:  z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(50_000).default(0),
  search: z.string().trim().min(1).max(200).optional(),
});
```

### SEC-05 · No rate limiting anywhere
**Files:** `server/index.ts`, `server/routes.ts`, `server/auth-adapter.ts`

`express-rate-limit` is not imported. `/api/auth/login` is brute-force-exposed,
`POST /api/keys` can be spammed to create arbitrarily many keys per user, and
`authenticateApiKey` runs a DB round trip on every request with no caching.

**Fix:** add `express-rate-limit` with tighter limits on `/api/auth/*`, `/api/keys`, and
`/api/ingestion/*`, and a looser limit on `/api/v1/*` keyed by API-key id rather than IP.
Cache the `apiKeys.keyHash → row` lookup in-process for ~30 s.

### SEC-06 · No CORS configuration
**Files:** `server/index.ts`, `server/routes.ts`

No `cors` middleware. Current behaviour depends on the proxy in front of Replit; from the
outside, requests without an `Origin` header succeed, and preflight `OPTIONS` requests are
handled by Express's default (which does nothing useful).

**Fix:** add `cors({ origin: allowList, credentials: true })` with an explicit allow-list.
For the public `/api/v1/*` endpoints (API-key auth), `origin: "*"` is acceptable provided
credentials are not used and cookies are not sent.

### SEC-07 · No `helmet` / security headers
**Files:** `server/index.ts`

No `helmet()`, no CSP, no `X-Content-Type-Options`, no `Strict-Transport-Security`. The
portal serves HTML plus a public API — both benefit from standard hardening.

**Fix:** `app.use(helmet({ contentSecurityPolicy: { ... } }))` with a CSP that allows the
bundle's sources and disallows inline scripts where possible.

### SEC-08 · `SESSION_SECRET` validated only by `!` assertion
**File:** `server/auth-adapter.ts:34`

```ts
secret: process.env.SESSION_SECRET!,
```

If `SESSION_SECRET` is unset, the app boots fine and explodes later when a session is first
touched. If it's set but only 6 chars long, it still "works" but sessions are forgeable.

**Fix:** validate at startup with a Zod schema over `process.env`:

```ts
const env = z.object({
  DATABASE_URL:  z.string().url(),
  SESSION_SECRET: z.string().min(32),
  NODE_ENV: z.enum(["development","production","test"]),
}).parse(process.env);
```

Fail-fast on invalid env.

### SEC-09 · API-key expiry is optional → permanent keys by default
**Files:** `shared/schema.ts:117`, `server/routes.ts:35-37, 216-223`

```ts
expiresAt: timestamp("expires_at"),           // schema: nullable
// ...
expiresAt: null,                              // routes: always null on create
```

`authenticateApiKey` correctly checks expiry, but no key created via the public API ever
gets one. Keys never rotate, and a leaked key is valid forever unless manually deactivated.

**Fix:** default `expiresAt = now + 1 year`, expose a "rotate" endpoint, and warn in the
dashboard when a key is within 30 days of expiry.

### SEC-10 · No per-user cap on API keys
**File:** `server/routes.ts:203-236`

`POST /api/keys` has no maximum. A logged-in user can create thousands of keys. Combined
with SEC-05 (no rate limiting) this is both a DoS vector and a cleanup headache.

**Fix:** enforce e.g. 20 active keys per user, return 429 on overflow.

### SEC-11 · `GET /api/ingestion/logs` uses session auth not API-key auth
**File:** `server/routes.ts:282-289`

```ts
app.get("/api/ingestion/logs", isAuthenticated, async (req, res) => { ... });
```

Any logged-in user can read the ingestion logs, which include CDE URLs, batch counts, and
error messages. Probably intended to be operator-only.

**Fix:** add a role flag (`users.isAdmin`) and restrict.

---

## MEDIUM

### SEC-12 · `authenticateApiKey` logs usage on `res.on("finish")` but does not await
**File:** `server/routes.ts:42-56`

The usage log writes happen after the response is sent, which is fine, but the two writes
(`updateApiKeyLastUsed` + `logApiUsage`) are sequential and unawaited from the request
handler. On a DB hiccup they silently drop (logged to `console.error`) — breaking usage
accounting. Consider a buffered writer / `INSERT ... SELECT` batched every few seconds.

### SEC-13 · Missing Content-Type validation on JSON endpoints
**File:** `server/routes.ts:203-232`, `server/auth-adapter.ts:47-88`

`req.body` is trusted without checking `Content-Type`. If a client posts form-urlencoded,
`body-parser` may produce unexpected shapes. With Zod validation (SEC-04) this is mostly
caught, but belt-and-braces would require JSON content-type for write endpoints.

### SEC-14 · Inconsistent error response envelope
Across `server/routes.ts` and `server/auth-adapter.ts`, some handlers return `{error: "..."}`
while `authenticateApiKey` returns `{error: "..."}`, the auth user endpoint returns
`{message: "Unauthorized"}` (`auth-adapter.ts:131, 165`), and the dashboard uses yet another
shape. Standardise on `{error: {code, message, details?}}`.

### SEC-15 · No OpenAPI spec
No `/openapi.json`, no Swagger UI. `client/src/pages/docs.tsx` hardcodes the endpoint
reference. Every schema drift is a silent doc bug.

### SEC-16 · Generic 500s leak stack traces to server logs
**File:** `server/auth-adapter.ts:85-88, 122-125`

`console.error("Registration error:", e)` dumps the full error including DB paths in
production. With `NODE_ENV=production` this still ends up in `stdout`/Replit logs and could
be visible to operators without need-to-know. Use `pino` or similar with field-level
redaction.

### SEC-17 · Hardcoded `allow-list` for `isAuthenticated` behaviour split
**File:** `server/auth-adapter.ts:152-169`

`cachedIsAuthenticated` is set by `setupAuthAdapter` *before* `registerRoutes` runs only in
the Replit path. In the standalone path, a race is possible if routes are registered before
`setupAuthAdapter` completes — but `registerRoutes` awaits `setupAuthAdapter` (line 74), so
today it's safe. Worth a comment so a future refactor doesn't break it.

### SEC-18 · `req.session as any` everywhere
**File:** `server/auth-adapter.ts:80-82, 117-119, 129, 163`

Typescript types should be extended via `declare module "express-session"` once, not
`as any` at every site.

---

## LOW

### SEC-19 · Hard 500 on any storage failure in list endpoints
Every `catch` block in `server/routes.ts:86-88, 96-98, ...` returns the same
`{error: "Internal server error"}`. DB errors, programming errors, and transient failures
are indistinguishable to clients. At minimum map `PostgresError` to 503 when the cause is a
connection issue.

### SEC-20 · `GET /api/v1/overview` duplicates `/api/platform/stats`
**File:** `server/routes.ts:194-201, 273-280`

Same data, two endpoints, different auth stances. Pick one.

### SEC-21 · `GET /api/v1/indicators` and `GET /api/v1/student-groups` have no pagination
**File:** `server/routes.ts:154-170`

Fine today (small rows) but the API shape is inconsistent with the other list endpoints that
*do* paginate. A client SDK has to hardcode which ones paginate.

### SEC-22 · Missing `HEAD` / `OPTIONS` handling for public endpoints
Browser preflight requests will return 404 for `OPTIONS /api/v1/*`. Once CORS is added this
is solved automatically; noting it so nobody removes the `cors` middleware later.

### SEC-23 · `keyPrefix` is exactly 11 chars (`"csd_" + 7 hex`)
**File:** `server/routes.ts:214`, `shared/schema.ts:113`

`rawKey.substring(0, 11)` gives `csd_` + 7 hex chars = 11 chars. The column allows 12
(`varchar("key_prefix", { length: 12 })`), harmless mismatch but suggests intent drift.

### SEC-24 · No audit log for API-key deactivation
**File:** `server/routes.ts:248-257`

`DELETE /api/keys/:id` calls `storage.deactivateApiKey(id, userId)` with no record of who
deactivated when. Useful for incident response.

---

## Summary

The auth layer needs the two critical fixes (SEC-01, SEC-02) before anything else. The API
layer needs a single pass over input validation (SEC-04) to fix the bulk of the high-severity
issues, followed by rate limiting (SEC-05) and standardised envelopes (SEC-14). CORS and
helmet are one-line middleware additions that are inexcusably missing.

# 04 — React Client / Developer Portal UI

Primary files:
- `client/src/App.tsx`
- `client/src/lib/queryClient.ts`
- `client/src/lib/auth-utils.ts`
- `client/src/pages/{landing,dashboard,docs,explorer,auth,not-found}.tsx`

---

## HIGH

### UI-01 · Queries silently return nothing on error
**Files:** `client/src/pages/landing.tsx:13-15`, `client/src/pages/dashboard.tsx:32-34`

```tsx
const { data: stats } = useQuery<{...}>({
  queryKey: ["/api/platform/stats"],
});
```

No `isError`, no `error` destructured, no retry UI. When the API call fails the stats
section just doesn't render. For the landing page this currently hides the broken state
that SEC-03 / INGEST-01 are producing on production.

**Fix:** destructure `isError` + `error`, show a small inline error with a "retry" button
(`refetch()`).

### UI-02 · React Query config disables every safety net
**File:** `client/src/lib/queryClient.ts:44-57`

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: { retry: false },
  },
});
```

- `staleTime: Infinity`: data is never considered stale, so the landing page count never
  refreshes even if the user leaves the tab open for hours.
- `retry: false`: a single transient network blip becomes a permanent error.
- `refetchOnWindowFocus: false`: users returning to the tab see stale data with no recovery.

**Fix:** sensible defaults: `staleTime: 30_000`, `retry: 2`, `refetchOnWindowFocus: true`.
For truly static data like `/api/v1/indicators`, opt **in** to `staleTime: Infinity` per-query.

### UI-03 · `queryKey.join("/")` breaks for structured keys
**File:** `client/src/lib/queryClient.ts:32`

```ts
const res = await fetch(queryKey.join("/") as string, { credentials: "include" });
```

If any caller passes `["/api/v1/schools", { limit: 100 }]` the join produces
`"/api/v1/schools/[object Object]"`. Today no caller does — but the next contributor to add a
parameterised query will hit this. Use a proper `queryKey → url` helper that JSON-encodes
params as query string.

### UI-04 · SPA catch-all returns HTML 200 for unknown `/api/*` paths
**File:** `server/static.ts` / `server/vite.ts` (catch-all) + live observation

`GET https://caschooldatahub.s13i.me/random-xyz` returns 200 with the landing page HTML.
Same behaviour for any unknown `/api/*` path because the catch-all is mounted globally.
Client error handling (`throwIfResNotOk`, `client/src/lib/queryClient.ts:3-8`) treats 200 as
success, tries to parse HTML as JSON, and throws a cryptic error.

**Fix:** register the SPA catch-all *only* for non-`/api` paths. Return `404 {error: ...}` for
unknown API paths.

---

## MEDIUM

### UI-05 · Explorer throws away server error bodies
**File:** `client/src/pages/explorer.tsx:49-66`

```tsx
try {
  const response = await fetch(url, { headers: {...} });
  // ...
} catch (e) {
  setError("Network error");
}
```

The server's error body (`{error: "Invalid limit"}`) is never shown. Explorer users see a
useless generic message.

**Fix:** `await response.text()` on non-2xx and display the body.

### UI-06 · Explorer has no parameter validation
**File:** `client/src/pages/explorer.tsx:160-176`

Users can send arbitrary strings as query params. The portal is supposed to be a
teaching/exploration tool — it should know which params each endpoint accepts and hint on
bad input before the round-trip. This dovetails with generating an OpenAPI spec (see
roadmap P1).

### UI-07 · Avatar `<img>` has empty `alt`
**File:** `client/src/pages/dashboard.tsx:89`

```tsx
<img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" />
```

Screen readers skip it. Use `alt="User avatar"` or the user's name.

### UI-08 · `setTimeout` + hard redirect on 401
**File:** `client/src/lib/auth-utils.ts:14-16`

```ts
setTimeout(() => {
  window.location.href = "/api/login";
}, 500);
```

Full page reload instead of client-side navigation, plus a 500 ms flash of unhandled state.
Use wouter's `navigate("/auth")` or React Query's `onError` to trigger a proper redirect.

### UI-09 · Landing page has no loading skeleton
**File:** `client/src/pages/landing.tsx`

While stats load, the stats section is blank. A skeleton or shimmer prevents layout shift
and visible emptiness.

### UI-10 · Hard-coded copy mixes marketing and docs
Both `landing.tsx` and `docs.tsx` duplicate endpoint descriptions. A drift is inevitable.
Generate the docs list from the OpenAPI spec when it exists.

---

## LOW

### UI-11 · `replit_integrations/audio` is shipped to clients
**File:** `client/replit_integrations/audio/*.{ts,js}`

These files look like Replit-scaffolding for voice demos and are unused by the current
pages (`App.tsx` doesn't import them). They still get bundled, bloating the JS payload.
Either wire them into a feature or delete.

### UI-12 · Dashboard stats card uses the same unauth'd `/api/platform/stats`
**File:** `client/src/pages/dashboard.tsx:32-34`

Even authenticated dashboard users hit the unauthenticated public stats endpoint. If SEC-03
is fixed by making `/api/platform/stats` require auth, this still works (session cookie),
but the dashboard should be using an authenticated `/api/v1/overview` or a dedicated
`/api/dashboard/summary` that can be scoped to the user.

### UI-13 · Missing `robots.txt` / `sitemap.xml`
Public developer portals benefit from explicit robots directives and a sitemap for the
public pages (`/`, `/docs`). Currently neither is served.

### UI-14 · No favicon / meta description for OG cards
When the URL is pasted into Slack/Twitter, no preview renders. Add `<meta>` OG/Twitter tags
and a favicon.

### UI-15 · No error boundary
There's no top-level React error boundary. An unhandled render error in any page crashes
the whole app with a blank screen. Add an error boundary around the route tree.

# Story 21.4: Hub API Security Headers & CORS

Status: done

## Story

As a security officer,
I want the Hub API to enforce modern security headers and CORS,
so that cross-origin attacks and common web vulnerabilities are mitigated.

## Acceptance Criteria

1. **Given** any HTTP response from the Hub API, **Then** the following headers are set: `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`
2. **Given** a cross-origin request from a known spoke app origin (OPD Lite, Pharmacy Lite, Lab Lite, Admin Portal), **When** CORS preflight or actual request is received, **Then** the request is allowed with appropriate `Access-Control-Allow-*` headers
3. **Given** a cross-origin request from an unknown origin, **When** the request is received, **Then** no `Access-Control-Allow-Origin` is set (browser blocks the response)
4. **Given** a non-HTTPS connection in production, **When** the request arrives, **Then** it is rejected (HSTS + redirect or block)

## Tasks / Subtasks

- [x] Task 1: Add security headers via next.config.js (AC: #1)
  - [x] 1.1 In `apps/hub-api/next.config.js`, add a `headers()` async function that returns security headers for all routes (`source: '/(.*)'`):
    ```
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    X-Content-Type-Options: nosniff
    X-Frame-Options: DENY
    Referrer-Policy: strict-origin-when-cross-origin
    X-DNS-Prefetch-Control: off
    ```
  - [x] 1.2 These headers apply to ALL responses from the Hub API (including tRPC endpoints, health checks, and 404s)

- [x] Task 2: Implement CORS middleware for tRPC (AC: #2, #3)
  - [x] 2.1 Create `apps/hub-api/src/lib/cors.ts` — define allowed origins from env var `CORS_ALLOWED_ORIGINS` (comma-separated list). Fallback to `http://localhost:3000,http://localhost:3001,http://localhost:3002` for dev.
  - [x] 2.2 In `apps/hub-api/src/app/api/trpc/[trpc]/route.ts`:
    - Add CORS handling in the handler wrapper: check `Origin` header, set `Access-Control-Allow-Origin` (exact match only, never wildcard `*`), `Access-Control-Allow-Methods: GET, POST`, `Access-Control-Allow-Headers: Content-Type, Authorization`, `Access-Control-Max-Age: 86400`
    - Handle OPTIONS preflight: return 204 with CORS headers
  - [x] 2.3 Export the OPTIONS handler: `export { corsHandler as OPTIONS }` in route.ts
  - [x] 2.4 Unknown origins: simply don't set `Access-Control-Allow-Origin` — the browser blocks the response naturally

- [x] Task 3: HTTPS enforcement (AC: #4)
  - [x] 3.1 In production, HTTPS is enforced via the HSTS header (browsers auto-upgrade HTTP to HTTPS after first visit)
  - [x] 3.2 Add middleware in `apps/hub-api/src/middleware.ts` (Next.js middleware): in production (`NODE_ENV === 'production'`), if `x-forwarded-proto !== 'https'`, return 301 redirect to HTTPS
  - [x] 3.3 Skip this check in development

- [x] Task 4: Environment configuration (AC: #2)
  - [x] 4.1 Add `CORS_ALLOWED_ORIGINS` to `.env.example` with placeholder: `https://opd.ultranos.app,https://pharmacy.ultranos.app,https://lab.ultranos.app,https://admin.ultranos.app`
  - [x] 4.2 Document that in dev mode, localhost origins are allowed by default

- [x] Task 5: Tests (AC: all)
  - [x] 5.1 Test security headers present on all responses (check each header value)
  - [x] 5.2 Test CORS: allowed origin → `Access-Control-Allow-Origin` matches request origin
  - [x] 5.3 Test CORS: unknown origin → no `Access-Control-Allow-Origin` header
  - [x] 5.4 Test CORS: OPTIONS preflight → 204 with correct headers
  - [x] 5.5 Test HTTPS redirect in production mode
  - [x] 5.6 Test no HTTPS redirect in development mode

## Dev Notes

### Architecture & Patterns

- **No existing CORS or security headers anywhere.** The Hub API `next.config.js` currently has only `reactStrictMode: false` and `transpilePackages`. No `headers()` function, no middleware.
- **Next.js App Router CORS:** The tRPC adapter uses `fetchRequestHandler` which gives us full control over the Response object. For CORS on the tRPC routes specifically, we need to handle it in the route handler since `next.config.js` headers don't support dynamic origin matching.
- **next.config.js headers vs middleware:** Static headers (HSTS, X-Frame-Options, etc.) go in `next.config.js` because they're the same for every request. CORS needs dynamic origin matching so it goes in the route handler. HTTPS redirect goes in Next.js middleware.
- **No `middleware.ts` exists yet** in hub-api — this story creates it.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `apps/hub-api/next.config.js` | Add `headers()` function with security headers |
| `apps/hub-api/src/app/api/trpc/[trpc]/route.ts` | Add CORS handling, OPTIONS handler |
| `.env.example` | Add `CORS_ALLOWED_ORIGINS` |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `apps/hub-api/src/lib/cors.ts` | CORS origin validation utility |
| `apps/hub-api/src/middleware.ts` | Next.js middleware for HTTPS redirect |
| `apps/hub-api/src/__tests__/security-headers.test.ts` | Tests |

### References

- [Source: apps/hub-api/next.config.js] — current config (no headers)
- [Source: apps/hub-api/src/app/api/trpc/[trpc]/route.ts] — tRPC fetch handler where CORS goes
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-21] — Story 21.4 acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no debugging needed.

### Completion Notes List

- **Task 1:** Added `headers()` async function to `next.config.js` returning 5 security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, X-DNS-Prefetch-Control) for all routes via `/(.*)`
- **Task 2:** Created `cors.ts` utility with `isOriginAllowed()` and `corsHeaders()`. Updated tRPC route handler to apply CORS headers on allowed origins and export OPTIONS preflight handler returning 204. Never uses wildcard `*` — exact origin match only.
- **Task 3:** Created `middleware.ts` with Next.js middleware that 301 redirects HTTP→HTTPS in production by checking `x-forwarded-proto`. Skipped in development.
- **Task 4:** Added `CORS_ALLOWED_ORIGINS` to `.env.example` with documentation. Dev mode defaults to localhost:3000-3003.
- **Task 5:** 15 tests covering all ACs: security header presence, CORS allowed/rejected origins, preflight OPTIONS, HTTPS redirect in prod, no redirect in dev, null origin handling, production lockdown without env var.

### Change Log

- 2026-05-13: Implemented all 5 tasks for Story 21.4 — security headers, CORS, HTTPS enforcement, env config, tests

### Review Findings

- [x] [Review][Decision] Absent `x-forwarded-proto` allows HTTP pass-through in production — dismissed: all production traffic goes through LB that sets the header; standard practice
- [x] [Review][Patch] Production `CORS_ALLOWED_ORIGINS` unset silently rejects all origins — Added `validateCorsConfig()` startup check in route.ts
- [x] [Review][Decision] Dev fallback includes `localhost:3003` but spec says 3000-3002 — dismissed: harmless addition, Admin Portal may use 3003
- [x] [Review][Decision] CORS only applied to tRPC routes, not other API routes — dismissed: no spoke app calls non-tRPC routes today
- [x] [Review][Decision] Missing `Access-Control-Allow-Credentials` header — dismissed: JWTs sent via Authorization header, not cookies
- [x] [Review][Patch] Missing `Vary: Origin` on CORS responses — Added `Vary: Origin` to corsHeaders()
- [x] [Review][Patch] `x-forwarded-proto` with comma-separated values causes redirect loop — Fixed: split on comma and check first value
- [x] [Review][Patch] `applyCorsHeaders` may throw on immutable Response — Fixed: clone Response before setting headers
- [x] [Review][Patch] Middleware matcher catches `_next/static` and internal routes — Fixed: updated matcher to exclude `_next/static`, `_next/image`, `favicon.ico`
- [x] [Review][Patch] `applyCorsHeaders` on GET/POST not integration-tested — Added integration tests for Response cloning + CORS header application
- [x] [Review][Defer] Missing `Content-Security-Policy` header [next.config.js] — deferred, not in AC1 scope

### File List

- `apps/hub-api/next.config.js` — modified (added `headers()` function)
- `apps/hub-api/src/lib/cors.ts` — new (CORS origin validation utility)
- `apps/hub-api/src/app/api/trpc/[trpc]/route.ts` — modified (CORS handling, OPTIONS export)
- `apps/hub-api/src/middleware.ts` — new (HTTPS enforcement middleware)
- `apps/hub-api/.env.example` — modified (added CORS_ALLOWED_ORIGINS)
- `apps/hub-api/src/__tests__/security-headers.test.ts` — new (15 tests)

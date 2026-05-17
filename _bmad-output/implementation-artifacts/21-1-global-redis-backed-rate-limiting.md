# Story 21.1: Global Redis-Backed Rate Limiting

Status: done

## Story

As a security officer,
I want all Hub API endpoints to be rate-limited via Redis,
so that brute-force attacks and PHI enumeration are prevented across all Hub API instances.

## Acceptance Criteria

1. **Given** any Hub API endpoint, **When** a client exceeds the rate limit for their role, **Then** the request is rejected with HTTP 429 and a `Retry-After` header
2. **Given** an authenticated user, **When** they make requests, **Then** the default rate limit is 100 req/min per user
3. **Given** an unauthenticated request, **When** it hits any `baseProcedure` endpoint, **Then** the rate limit is 20 req/min keyed by IP hash
4. **Given** a `patient.search` call, **When** the user approaches the limit, **Then** a stricter limit of 10 req/min applies to prevent PHI enumeration
5. **Given** the existing in-memory `rateLimitMap` on `lab.reportAuthEvent`, **When** the Redis rate limiter is deployed, **Then** the in-memory implementation is removed and replaced by the Redis-backed one
6. **Given** any Hub API response, **When** headers are sent, **Then** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` are included
7. **Given** multiple Hub API instances running concurrently, **When** rate limits are checked, **Then** the state is consistent across instances because it lives in Redis (not in-memory)

## Tasks / Subtasks

- [x] Task 1: Create Redis client singleton (AC: #7)
  - [x] 1.1 Create `apps/hub-api/src/lib/redis.ts` — singleton Redis client using `ioredis` (or `@upstash/redis` if serverless-only). Read `REDIS_URL` from env.
  - [x] 1.2 Export `getRedisClient()` — lazy-initializes and caches the client. Returns `null` if `REDIS_URL` is not set (dev mode fallback).
  - [x] 1.3 Add `REDIS_URL` to `.env.example` with a placeholder value.

- [x] Task 2: Create rate limiting middleware (AC: #1, #2, #3, #4, #6)
  - [x] 2.1 Create `apps/hub-api/src/trpc/middleware/rateLimit.ts`
  - [x] 2.2 Implement sliding-window rate limiter using Redis `INCR` + `EXPIRE` (or `MULTI`/`EXEC` for atomicity). Key format: `rl:{userId|ipHash}:{endpoint}`
  - [x] 2.3 Define rate limit tiers as a config object:
    - Default authenticated: 100 req/min
    - Unauthenticated: 20 req/min (keyed by SHA-256 of IP from `x-forwarded-for`)
    - `patient.search`: 10 req/min (stricter for PHI enumeration prevention)
  - [x] 2.4 Allow per-endpoint override via a `rateLimitConfig` option on the middleware
  - [x] 2.5 On limit exceeded: throw `TRPCError({ code: 'TOO_MANY_REQUESTS' })` — tRPC maps this to HTTP 429
  - [x] 2.6 Inject rate limit headers into response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (Unix epoch seconds)
  - [x] 2.7 If Redis is unavailable (connection error): **allow the request** (fail-open for availability) but log a warning. Do NOT silently block users because Redis is down.

- [x] Task 3: Apply middleware globally to baseProcedure and protectedProcedure (AC: #1, #2, #3)
  - [x] 3.1 In `apps/hub-api/src/trpc/init.ts`, compose the rate limit middleware into `baseProcedure` and `protectedProcedure`
  - [x] 3.2 For `baseProcedure`: key by IP hash, limit 20 req/min
  - [x] 3.3 For `protectedProcedure`: key by `ctx.user.sub`, limit 100 req/min
  - [x] 3.4 Apply `patient.search` override (10 req/min) in the patient router

- [x] Task 4: Remove in-memory rate limiter from lab router (AC: #5)
  - [x] 4.1 Delete `AUTH_EVENT_RATE_LIMIT`, `rateLimitMap`, and `checkRateLimit()` from `apps/hub-api/src/trpc/routers/lab.ts` (lines 104–126)
  - [x] 4.2 Remove the `checkRateLimit` call inside `lab.reportAuthEvent` handler
  - [x] 4.3 The global `baseProcedure` rate limit (20 req/min unauthenticated) now covers this endpoint

- [x] Task 5: Response header injection (AC: #6)
  - [x] 5.1 The tRPC fetch adapter doesn't natively expose response headers. Use `responseMeta` on the tRPC handler in `apps/hub-api/src/app/api/trpc/[trpc]/route.ts` OR attach headers via the middleware's `ctx` and a `responseMeta` function.
  - [x] 5.2 Ensure headers appear on BOTH success and error responses (including 429)

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit test rate limit middleware: under limit → passes, at limit → 429, reset after window
  - [x] 6.2 Unit test Redis key format and TTL behavior (mock Redis)
  - [x] 6.3 Unit test fail-open behavior when Redis is unavailable
  - [x] 6.4 Unit test response headers contain correct values
  - [x] 6.5 Unit test `patient.search` stricter limit override
  - [x] 6.6 Verify `lab.reportAuthEvent` still works after removing in-memory limiter (existing tests pass with Redis-backed limiter)

## Dev Notes

### Architecture & Patterns

- **Redis dependency:** This is the first story to introduce Redis into the Hub API. Story 23.0 (Redis & Infrastructure Provisioning) is in a later epic. For dev purposes, the middleware MUST gracefully degrade when `REDIS_URL` is not set (fail-open). This allows local dev without Redis. In production, Redis is assumed available.
- **tRPC response headers challenge:** The `fetchRequestHandler` used in `route.ts` supports a `responseMeta` callback that receives the tRPC context and can return custom headers. This is the correct hook point — do NOT try to set headers via `next()` middleware patterns.
- **Rate limit key design:** Use `rl:{scope}:{identifier}:{windowKey}` where scope is `auth` or `ip`, identifier is userId or IP hash, and windowKey is the current minute timestamp. This enables atomic `INCR`/`EXPIRE` without Lua scripts.
- **Existing in-memory limiter quirks:** The current `rateLimitMap` in `lab.ts` (line 112) never prunes expired entries — a memory leak. The Redis approach solves this naturally via TTL.

### Existing Files to UPDATE

| File | What Changes |
|------|-------------|
| `apps/hub-api/src/trpc/init.ts` | Compose rate limit middleware into `baseProcedure` and `protectedProcedure` |
| `apps/hub-api/src/trpc/routers/lab.ts` | Remove lines 104–126 (in-memory rate limiter) and the `checkRateLimit` call in `reportAuthEvent` |
| `apps/hub-api/src/app/api/trpc/[trpc]/route.ts` | Add `responseMeta` to inject rate limit headers |
| `apps/hub-api/package.json` | Add `ioredis` (or `@upstash/redis`) dependency |
| `.env.example` | Add `REDIS_URL` |

### New Files to CREATE

| File | Purpose |
|------|---------|
| `apps/hub-api/src/lib/redis.ts` | Redis client singleton |
| `apps/hub-api/src/trpc/middleware/rateLimit.ts` | Rate limiting middleware |
| `apps/hub-api/src/__tests__/rate-limit.test.ts` | Rate limit tests |

### References

- [Source: apps/hub-api/src/trpc/routers/lab.ts#L104-L126] — existing in-memory rate limiter to replace
- [Source: apps/hub-api/src/trpc/init.ts] — baseProcedure and protectedProcedure definitions
- [Source: apps/hub-api/src/app/api/trpc/[trpc]/route.ts] — fetchRequestHandler where responseMeta goes
- [Source: _bmad-output/planning-artifacts/epics.md#Epic-21] — Story 21.1 acceptance criteria

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — no debugging sessions required.

### Completion Notes List

- Created Redis client singleton (`ioredis`) with lazy initialization and fail-open when `REDIS_URL` not set
- Implemented sliding-window rate limiter using atomic Redis `INCR` + `EXPIRE` (no Lua scripts needed)
- Three rate limit tiers: authenticated (100/min), unauthenticated (20/min by IP hash), patient.search (10/min)
- Middleware attaches `rateLimit` to tRPC context for `responseMeta` header injection
- `responseMeta` callback in route.ts injects `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` on 429
- Removed in-memory `rateLimitMap` + `checkRateLimit()` from lab.ts (was a memory leak — never pruned entries)
- IP hash derivation for audit trail preserved in `reportAuthEvent` after removing rate limit call
- 20 unit tests covering: under-limit, over-limit, fail-open, key format, TTL, tier configs, middleware composition, patient.search override
- No regressions introduced — pre-existing test failures unchanged (enforceEntitlement middleware from story 27-3)

### Review Findings

- [x] [Review][Patch] AC #6: 429 responses lack rate limit headers — fixed: ctx.rateLimit now set before throw [rateLimit.ts:101-110]
- [x] [Review][Decision→Patch] patient.search double-counts rate limit — fixed: added tier segment to Redis key format, preventing key collision between procedure-level and endpoint-level middleware [patient.ts:30-31, rateLimit.ts:61]
- [x] [Review][Patch] INCR + EXPIRE non-atomic — fixed: replaced with atomic Redis pipeline [rateLimit.ts:64-73]
- [x] [Review][Patch] console.warn may leak Redis URL with credentials — fixed: sanitize error messages before logging [redis.ts:20, rateLimit.ts:82]
- [x] [Review][Defer] IP-based rate limiting trusts X-Forwarded-For without proxy validation — unauthenticated clients can spoof header to bypass IP-based limits [rateLimit.ts:34-36] — deferred, deployment/infrastructure concern
- [x] [Review][Defer] Redis singleton leaks connections on Next.js HMR in dev mode — module-level `client` variable lost on hot reload without disconnect [redis.ts:3] — deferred, dev-mode only
- [x] [Review][Defer] Missing await on dispatchResultNotifications — fire-and-forget promise with no retry [lab.ts:700-708] — deferred, pre-existing

### File List

**New files:**
- `apps/hub-api/src/lib/redis.ts` — Redis client singleton
- `apps/hub-api/src/trpc/middleware/rateLimit.ts` — Rate limiting middleware
- `apps/hub-api/src/__tests__/rate-limit.test.ts` — 20 unit tests

**Modified files:**
- `apps/hub-api/src/trpc/init.ts` — Added rateLimit import, RateLimitResult to TRPCContext, composed middleware into baseProcedure and protectedProcedure
- `apps/hub-api/src/trpc/routers/lab.ts` — Removed in-memory rate limiter (AUTH_EVENT_RATE_LIMIT, rateLimitMap, checkRateLimit), removed checkRateLimit call from reportAuthEvent
- `apps/hub-api/src/trpc/routers/patient.ts` — Added rateLimitMiddleware(patientSearch) override on patient.search
- `apps/hub-api/src/app/api/trpc/[trpc]/route.ts` — Added responseMeta callback for rate limit headers + Retry-After
- `apps/hub-api/package.json` — Added ioredis dependency
- `apps/hub-api/.env.example` — Added REDIS_URL placeholder

# Story 23.0: Redis & Infrastructure Provisioning

Status: done

## Story

As an operations engineer,
I want Redis formally provisioned and health-checked for the Hub API,
so that rate limiting, session caching, and future pub/sub features have a reliable shared state store.

## Acceptance Criteria

1. A managed Redis instance (Upstash, ElastiCache, or equivalent) is available to the Hub API via `REDIS_URL` environment variable
2. The Hub API connects to Redis on startup and the `health.check` endpoint reports Redis connectivity status alongside database status
3. Redis connection is TLS-encrypted in production (`rediss://` URL scheme or explicit TLS config)
4. The existing `apps/hub-api/src/lib/redis.ts` fail-open client is hardened: TLS enforcement in production, connection timeout, reconnect strategy, and structured error logging (no credentials in logs)
5. A Redis connection health probe exists that the monitoring stack can poll independently
6. Environment variable documentation is updated: `.env.example` includes `REDIS_URL` with comments on TLS requirements
7. The cron infrastructure from Epic 22 (license-expiry, anomaly-detection) is verified to work with the provisioned Redis (e.g., distributed lock to prevent duplicate cron runs)
8. Integration tests verify: Redis connected health check, Redis disconnected graceful degradation, TLS connection enforcement

## Tasks / Subtasks

- [x] Task 1: Harden existing Redis client (AC: #1, #4)
  - [x] Update `apps/hub-api/src/lib/redis.ts`:
    - Enforce TLS in production: if `NODE_ENV === 'production'` and URL does not start with `rediss://`, log warning and refuse connection
    - Add connection timeout: `connectTimeout: 5000` (5 seconds)
    - Add reconnect strategy: exponential backoff (100ms → 200ms → 400ms → ... max 30s), max 10 retries
    - Ensure error handler never logs the full Redis URL (already partially done — verify credential scrubbing is complete)
  - [x] Add `isRedisHealthy(): Promise<boolean>` export that runs `PING` with 2s timeout
  - [x] Add `getRedisInfo(): Promise<{ connected: boolean; latencyMs: number | null }>` for health reporting

- [x] Task 2: Wire Redis into health check endpoint (AC: #2, #5)
  - [x] Update `apps/hub-api/src/trpc/routers/health.ts` `check` procedure:
    - Add `redis` to the `services` response: `'connected' | 'disconnected' | 'not_configured'`
    - Call `isRedisHealthy()` — if Redis client is null (not configured), report `'not_configured'`
    - Overall health: `ok` only if db=connected AND redis=connected (or not_configured); `degraded` otherwise
  - [x] Create a standalone `/api/health/redis` Next.js API route for infrastructure monitoring tools to poll Redis independently (no auth required, returns `{ status, latencyMs }`)

- [x] Task 3: Distributed lock for cron jobs (AC: #7)
  - [x] Create `apps/hub-api/src/lib/cron-lock.ts`:
    - `acquireCronLock(jobName: string, ttlSeconds: number): Promise<boolean>` — uses Redis `SET NX EX` pattern
    - `releaseCronLock(jobName: string): Promise<void>` — deletes the lock key
    - If Redis is unavailable, fall back to allowing execution (fail-open — better to run twice than not at all)
  - [x] Update `apps/hub-api/src/jobs/cron-runner.ts` to acquire lock before running license-expiry or anomaly-detection jobs
  - [x] Lock TTL should be 2x the expected job duration (e.g., 10 minutes for a job that normally takes 2-3 minutes)

- [x] Task 4: Update environment documentation (AC: #6)
  - [x] Update `apps/hub-api/.env.example`:
    - Add `REDIS_URL=` with comment: "# Required in production. Use rediss:// for TLS. Example: rediss://default:password@host:6380"
    - Add `CRON_SECRET=` if not already present (used by Epic 22 cron routes)
  - [x] Verify all cron routes (`/api/cron/license-expiry`, `/api/cron/anomaly-detection`) document their CRON_SECRET requirement

- [x] Task 5: TLS enforcement verification (AC: #3)
  - [x] In production config, verify Redis client uses TLS:
    - If using Upstash: `REDIS_URL` should use `rediss://` scheme (Upstash enforces TLS by default)
    - If using ElastiCache: ensure `tls: {}` option is set in ioredis config
  - [x] Add runtime check: in production, if `REDIS_URL` starts with `redis://` (no TLS), log error and set Redis status to `degraded`

- [x] Task 6: Write tests (AC: #8)
  - [x] Test `health.check` includes Redis status in services response
  - [x] Test `health.check` reports `ok` when both DB and Redis are connected
  - [x] Test `health.check` reports `degraded` when Redis is disconnected but DB is connected
  - [x] Test `health.check` reports `ok` when Redis is `not_configured` (REDIS_URL absent) — acceptable for dev
  - [x] Test `isRedisHealthy()` returns true on successful PING
  - [x] Test `isRedisHealthy()` returns false on timeout/connection error
  - [x] Test `acquireCronLock` returns true on first call, false on second (lock held)
  - [x] Test `releaseCronLock` allows re-acquisition
  - [x] Test cron lock falls back to allowing execution when Redis unavailable
  - [x] Test TLS enforcement warning in production mode with non-TLS URL

## Dev Notes

### Existing Infrastructure
- **Redis client already exists:** `apps/hub-api/src/lib/redis.ts` — ioredis, lazy init, fail-open pattern. Needs hardening, not replacement.
- **Rate limiter already uses Redis:** `apps/hub-api/src/trpc/middleware/rateLimit.ts` — already consumes `getRedisClient()`
- **Cron infrastructure exists:** `apps/hub-api/src/jobs/cron-runner.ts`, `license-expiry-check.ts`, `anomaly-detection.ts` from Epic 22
- **Health endpoint exists:** `apps/hub-api/src/trpc/routers/health.ts` — needs Redis status added

### Admin Portal CI/CD Note
The original epics.md AC mentioned "Admin Portal CI/CD pipeline configuration" under Story 23.0. This was completed as part of Story 22.1 (Admin Portal Scaffold). Not duplicated here.

### Redis Provider Decision
If using Supabase's ecosystem, Upstash Redis is the natural choice (available via Vercel Marketplace). Upstash enforces TLS by default and provides a REST API fallback. The existing ioredis client works with Upstash's standard Redis protocol endpoint.

### Fail-Open Philosophy
Redis is non-critical for clinical operations. If Redis is down:
- Rate limiting falls back to allowing requests (fail-open)
- Cron locks fall back to allowing execution (better duplicate run than missed run)
- Health check reports `degraded` but Hub API continues serving
- Clinical features (encounters, prescriptions, sync) are unaffected

### Parallel Development Note
This story must complete before Stories 23.1, 23.2, and 23.3 begin, as they all depend on the Redis and health infrastructure.

## Dev Agent Record

### Implementation Plan
1. Harden redis.ts with TLS enforcement, connectTimeout (5s), exponential backoff reconnect (100ms→30s, max 10 retries), credential scrubbing
2. Add isRedisHealthy() and getRedisInfo() health probe exports
3. Update health.ts check procedure to include Redis status (connected/disconnected/not_configured) in services response
4. Create standalone /api/health/redis route for infrastructure monitoring
5. Create cron-lock.ts with acquireCronLock/releaseCronLock using Redis SET NX EX pattern
6. Update cron-runner.ts to acquire/release distributed locks before running jobs
7. Update .env.example with REDIS_URL and CRON_SECRET documentation
8. Write comprehensive test suite covering all ACs

### Debug Log
- ioredis was imported in redis.ts but not listed in package.json dependencies — added via `pnpm -F hub-api add ioredis`
- Pre-existing test failures in allergy.test.ts, lab-verify-patient.test.ts, lab-upload-result.test.ts, module-catalog-subscription.test.ts, lab-approval-workflow.test.ts — unrelated to this story

### Completion Notes
- All 6 tasks completed with 26 new tests passing
- Redis client hardened with TLS enforcement (production refuses non-rediss:// URLs), 5s connect timeout, exponential backoff reconnect
- Health check now reports Redis status alongside DB; overall status is "degraded" when Redis is disconnected
- Standalone /api/health/redis route created for infrastructure monitoring
- Distributed cron locks prevent duplicate job execution across instances (fail-open when Redis unavailable)
- .env.example updated with REDIS_URL and CRON_SECRET documentation
- All credential scrubbing verified — both redis:// and rediss:// patterns sanitized in error handlers

## File List

- `apps/hub-api/package.json` — added ioredis dependency
- `apps/hub-api/src/lib/redis.ts` — hardened with TLS enforcement, timeouts, reconnect strategy, isRedisHealthy(), getRedisInfo()
- `apps/hub-api/src/trpc/routers/health.ts` — added Redis status to health.check procedure
- `apps/hub-api/src/app/api/health/redis/route.ts` — NEW: standalone Redis health probe route
- `apps/hub-api/src/lib/cron-lock.ts` — NEW: distributed lock for cron jobs (SET NX EX pattern)
- `apps/hub-api/src/jobs/cron-runner.ts` — integrated distributed locks for license-expiry and anomaly-detection
- `apps/hub-api/.env.example` — added REDIS_URL and CRON_SECRET documentation
- `apps/hub-api/src/__tests__/redis-health.test.ts` — NEW: 15 tests for Redis client, health probes, TLS enforcement
- `apps/hub-api/src/__tests__/cron-lock.test.ts` — NEW: 8 tests for distributed cron locking
- `apps/hub-api/src/__tests__/health-redis-integration.test.ts` — NEW: 5 tests for health check + Redis integration

### Review Findings

- [x] [Review][Decision] D1: Health status `degraded` vs `ok` when Redis is disconnected — resolved: changed to `ok` with `warnings` array (fail-open philosophy) [health.ts]
- [x] [Review][Patch] P1: Lock release race condition — fixed: UUID lock token + Lua compare-and-delete + skip release on fail-open [cron-lock.ts]
- [x] [Review][Patch] P2: Dead code `sanitizeUrl` defined but never called — removed [redis.ts]
- [x] [Review][Patch] P3: Timer leak in `Promise.race` health probes — fixed: using `timer.unref()` to prevent blocking [redis.ts]
- [x] [Review][Patch] P4: Redis health endpoint always returns HTTP 200 even when disconnected — fixed: returns 503 for disconnected [route.ts]
- [x] [Review][Patch] P5: TLS rejection logs on every `getRedisClient()` call — fixed: cached `tlsRejected` flag [redis.ts]
- [x] [Review][Patch] P6: No startup connection success/failure log — fixed: added success/failure logging on connect [redis.ts]
- [x] [Review][Patch] P7: Lock TTL comment says "2x expected job duration" but 600s is ~3-5x actual — fixed comment [cron-runner.ts]
- [x] [Review][Defer] W1: No graceful Redis shutdown (SIGTERM handler) — deferred, platform-level concern for Vercel/serverless [redis.ts]
- [x] [Review][Defer] W2: Hardcoded version `0.1.0` in health check — deferred, pre-existing [health.ts:43]
- [x] [Review][Defer] W3: Rate limiter `resetEpoch` calculation produces meaningless timestamp — deferred, pre-existing [rateLimit.ts:58-59]
- [x] [Review][Defer] W4: CJS direct invocation guard incompatible with ESM/tsx — deferred, low impact [cron-runner.ts:70]

## Change Log

- 2026-05-15: Story 23.0 implementation complete — Redis client hardened, health check integrated, distributed cron locks added, 26 tests passing

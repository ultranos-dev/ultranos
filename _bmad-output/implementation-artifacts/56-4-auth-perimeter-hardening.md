# Story 56.4: Auth Perimeter Hardening (JWT, Open Redirect, Rate Limits, Spoofable Audit Endpoints)

Status: ready-for-dev

## Story

As a platform security owner,
I want the remaining auth-perimeter weaknesses closed — JWT algorithm pinning with issuer/audience validation, the admin-portal open redirect fixed, auth-critical rate limiting failing closed, and the unauthenticated audit-event endpoints constrained,
so that the perimeter matches the standard the rest of the security work assumes.

## Acceptance Criteria

1. **Given** a JWT whose header requests an unexpected algorithm, **when** the Hub verifies it, **then** verification uses a pinned algorithm allowlist (no attacker-influenced `alg` selection) and validates `iss` and `aud`.
2. **Given** an admin logs in with `?returnUrl=//evil.com` (or `/\evil.com`), **when** login succeeds, **then** navigation stays on-origin — only same-origin path redirects are honored.
3. **Given** Redis is unavailable or errors, **when** the patient OTP request endpoint (and other auth-critical limiters) is called, **then** rate limiting fails CLOSED for those endpoints (throttled/queued), not open.
4. **Given** the unauthenticated `admin.reportAuthEvent` / `lab.reportAuthEvent` endpoints, **when** events are submitted, **then** attribution is constrained (server-validated actor resolution, no arbitrary `actorEmail` accepted verbatim), rate limiting is Redis-backed (not per-instance in-memory), and the in-memory map leak is removed.
5. **Given** `audit.sync` receives client-submitted events, **then** submissions are validated against an allowlist of client-claimable actions/resource types with plausibility constraints, and are rate limited.
6. **Zero regression:** all legitimate token verification, login redirects to internal pages, OTP requests under normal Redis operation, and genuine client audit-event drains behave identically; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [ ] **Task 1: JWT hardening** (AC: 1)
  - [ ] 1.1 In `apps/hub-api/src/lib/jwt.ts:26-49`: stop selecting the algorithm from the unverified header; pass an explicit `algorithms` allowlist plus `issuer`/`audience` options to `jwtVerify`. Evaluate whether the HS256 fallback is still needed; if kept, restrict it to a dedicated code path with its own allowlist.
  - [ ] 1.2 Remove the dead `getSupabaseJwk()` marker hack (`jwt.ts:59-62`) and the unused `SUPABASE_JWT_JWK` entry in `.env.example` if confirmed unused.
- [ ] **Task 2: Open redirect fix** (AC: 2)
  - [ ] 2.1 `apps/admin-portal/src/app/[locale]/login/page.tsx:104-105` and `:190-191`: replace `startsWith('/')` with a helper rejecting `//` and `/\` prefixes; add unit test. Sweep the other three apps' login pages for the same pattern.
- [ ] **Task 3: Fail-closed rate limiting for auth endpoints** (AC: 3)
  - [ ] 3.1 `apps/hub-api/src/middleware/rateLimit.ts:63-94`: add a `critical: boolean` option — critical limiters (OTP request `patient-registration.ts:116-117`, login-adjacent endpoints) deny on missing/errored Redis; non-critical limiters keep fail-open.
- [ ] **Task 4: Spoofable event endpoints** (AC: 4, 5)
  - [ ] 4.1 `admin.reportAuthEvent` (`admin.ts:29-31`) and `lab.reportAuthEvent` (`lab.ts:141-159`): move rate limiting to the shared Redis limiter; prune/remove the unbounded `rateLimitMap`; validate that reported practitioner/actor identifiers resolve to real accounts before attributing LOGIN_FAILURE events; consider namespacing OPD's auth events out of `lab.*` (OPD currently posts to `lab.reportAuthEvent` — `apps/opd-lite/src/lib/trpc.ts:26-45`).
  - [ ] 4.2 `audit.sync` (`audit.ts:24-80`): restrict `action`/`resourceType` to a client-claimable allowlist; keep server-side actor override (already correct); add rate limit.
- [ ] **Task 5: Tests + regression verification** (AC: 6)
  - [ ] 5.1 Tests: alg-confusion token rejected; `//evil.com` redirect blocked while `/ar/dashboard` works; OTP endpoint denies when Redis down; spoofed actorEmail not attributed; audit.sync rejects non-allowlisted actions.
  - [ ] 5.2 Full hub-api + admin-portal test suites pass; OPD/lab/pharmacy login-failure reporting still records events; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-HUB-8 [A]**, **M-HUB-2 [A]**, **M-HUB-3 [A]**, **M-HUB-4 [A]**, **H-ADM-1 [A]**, **M-OPD-... (reportAuthEvent spoofing, audit §4 M-OPD)** — audit §3 and §7. The larger auth-architecture decision (Supabase cookie sessions vs documented in-memory/Redis model — audit §8 Theme 4) is explicitly a **decision point for the user**, tracked in the remediation overview; this story hardens the perimeter without deciding that question.

### Architecture

- Keep changes surgical: this story does not change token storage in the clients (accepted deviation pending the Theme-4 decision) and does not touch MFA (Story 56.3).
- Fail-closed rate limiting must not lock out clinics during Redis blips for non-auth traffic — hence the `critical` flag split.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Legitimate tokens verify, internal redirects work, OTP flows work under healthy Redis, and genuine audit drains continue. Only forged/malformed/abusive traffic sees new denials. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `apps/hub-api/src/lib/jwt.ts`, `middleware/rateLimit.ts`, `trpc/routers/admin.ts`, `lab.ts`, `audit.ts`, `apps/admin-portal/.../login/page.tsx` (+ shared redirect helper).
**Tests:** `apps/hub-api/src/__tests__/jwt-hardening.test.ts`, `rate-limit-critical.test.ts`; admin-portal login redirect test.

### References

- [Source: docs/system-audit-2026-09-23.md#3-hub-api-appshub-api] — H-HUB-8, M-HUB-1..3
- [Source: docs/system-audit-2026-09-23.md#7-admin-portal-appsadmin-portal] — H-ADM-1
- [Source: apps/hub-api/src/lib/jwt.ts:26-62]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

# Story 12.1: Lab Credentialing & Technician Authentication

Status: done

## Story

As a lab technician,
I want to register my lab and authenticate with my credentials,
so that I can upload results that are tied to my verified identity and lab affiliation.

## Context

The lab portal requires verified lab registration before technicians can upload results. This story establishes the authentication and identity binding that ensures every upload is traceable to a specific technician at a specific lab. TOTP MFA is required for all clinical staff including lab technicians (PRD CL-07).

**PRD Requirements:** LAB-001 (Lab Registration), LAB-002 (Technician Identity Binding)

## Acceptance Criteria

1. [x] Lab technicians can authenticate via Supabase Auth with TOTP MFA enforced.
2. [x] The tRPC middleware extracts and validates the `LAB_TECH` role from the JWT.
3. [x] Each authenticated session includes the technician's ID and lab affiliation in the context.
4. [x] The Hub API exposes a `lab.register` endpoint for lab registration submissions (license, accreditation, technician credentials).
5. [x] Registered labs start in `PENDING` status until back-office verification.
6. [x] Only technicians with `ACTIVE` lab status can access upload workflows.
7. [x] All authentication events (login, MFA, failed attempts) emit audit events via `@ultranos/audit-logger`.

## Tasks / Subtasks

- [x] **Task 1: RBAC Extension for LAB_TECH Role** (AC: 2, 3)
  - [x] Add `LAB_TECH` to the RBAC role enum in `hub-api`.
  - [x] Create `roleRestrictedProcedure` variant for lab-scoped endpoints.
  - [x] Ensure lab role context includes `technicianId` and `labId`.

- [x] **Task 2: Lab Registration Endpoint** (AC: 4, 5)
  - [x] Create `hub-api/src/trpc/routers/lab.ts` with `lab.register` procedure.
  - [x] Accept: lab name, operating license reference, ISO 15189 accreditation (optional), responsible technician credentials.
  - [x] Store lab record with status `PENDING`.
  - [x] Create Supabase migration for `labs` table (`id`, `name`, `license_ref`, `accreditation_ref`, `status`, `created_at`, `verified_at`).

- [x] **Task 3: Lab Status Gate** (AC: 6)
  - [x] Create middleware that checks lab status before allowing upload operations.
  - [x] Return clear error if lab is `PENDING` or `SUSPENDED`.

- [x] **Task 4: Auth UI in Lab-Lite** (AC: 1)
  - [x] Create login page at `apps/lab-lite/src/app/login/page.tsx`.
  - [x] Integrate Supabase Auth with TOTP MFA flow.
  - [x] Redirect to upload dashboard on successful auth.

- [x] **Task 5: Audit Integration** (AC: 7)
  - [x] Emit audit events for login success, login failure, and MFA verification.

### Review Findings

- [x] [Review][Decision] **D1: `reportAuthEvent` is unauthenticated and spoofable** — Resolved: added rate limiting (20 req/min per IP) + actorId UUID validation against practitioners table. Long-term server-side capture deferred (W6 in deferred-work.md). [lab.ts:101]
- [x] [Review][Decision] **D2: ADMIN bypass injects fake `labId: 'ADMIN_OVERRIDE'`** — Resolved: ADMIN now skips lab context entirely. `enforceLabActive` updated to allow missing `ctx.lab`. Downstream endpoints check `ctx.lab` existence. [rbac.ts:111-120]
- [x] [Review][Decision] **D3: No uniqueness constraint on `license_ref` in labs table** — Resolved: added `UNIQUE` constraint on `license_ref` in migration. [006_lab_tables.sql:11]
- [x] [Review][Patch] **P1: Login page never calls `reportAuthEvent`** — Fixed: added `reportAuthEvent()` calls for LOGIN_SUCCESS, LOGIN_FAILURE, MFA_VERIFY_SUCCESS, MFA_VERIFY_FAILURE. [login/page.tsx]
- [x] [Review][Patch] **P2: Lab registration non-transactional** — Fixed: added compensating delete of orphaned lab record on technician binding failure. [lab.ts:32-71]
- [x] [Review][Patch] **P3: Missing `resourceId` in `reportAuthEvent`** — Fixed: added `resourceId: validatedActorId ?? 'anonymous'`. [lab.ts:135-149]
- [x] [Review][Patch] **P4: Supabase client created on every render** — Fixed: converted to singleton pattern in `supabase.ts`. [supabase.ts]
- [x] [Review][Patch] **P5: "Back to sign in" doesn't revoke partial session** — Fixed: `handleBackToSignIn()` now calls `supabase.auth.signOut()`. [login/page.tsx]
- [x] [Review][Patch] **P6: Password/email not cleared after credential success** — Fixed: password cleared after successful signIn, email cleared on back navigation. [login/page.tsx]
- [x] [Review][Patch] **P7: `resourceType: 'USER_ACCOUNT'` wrong for lab registration** — Fixed: changed to `'Organization'`. [lab.ts:77]
- [x] [Review][Patch] **P8: `supabase.ts` env var assertions** — Fixed: added runtime guard with descriptive error. [supabase.ts]
- [x] [Review][Patch] **P9: No test for `audit.emit()` failure** — Fixed: added test asserting error propagation on audit failure. [lab-audit.test.ts]
- [x] [Review][Patch] **P10: No test for lab insert failure** — Fixed: added INTERNAL_SERVER_ERROR test case. [lab-register.test.ts]
- [x] [Review][Patch] **P11: No test for MFA challenge error** — Fixed: added MFA challenge error path test + audit event assertion tests. [login-page.test.tsx]
- [x] [Review][Defer] **W1: Migration file written manually instead of Supabase MCP tools** — Process concern, migration content correct. deferred, pre-existing
- [x] [Review][Defer] **W2: No RTL snapshot tests for login page** — Cross-cutting RTL testing infrastructure (Story 1-5/11-1). deferred, pre-existing
- [x] [Review][Defer] **W3: No inactivity timeout on lab-lite session** — 30-min re-auth is cross-cutting session management concern. deferred, pre-existing
- [x] [Review][Defer] **W4: Audit hash chain race condition on concurrent requests** — Pre-existing in audit-logger, not caused by this change. deferred, pre-existing
- [x] [Review][Defer] **W5: x-forwarded-for header trust without proxy validation** — Infrastructure-level concern, not story-scoped. deferred, pre-existing

## Dev Notes

- **Lab registration is back-office verified.** This story does NOT implement the admin verification UI — that's a back-office concern. This story creates the submission endpoint and status gating.
- **RBAC pattern:** Follow the same pattern as Story 6.1 for role middleware.
- **Data minimization starts here:** The lab auth context must NOT include any patient data.

### References

- PRD: LAB-001, LAB-002, CL-07 (MFA requirement)
- Story 6.1: Role-Based Access Control (existing RBAC pattern)
- CLAUDE.md Rule #7: Lab Portal data minimization

## Dev Agent Record

### Implementation Plan

- Used existing `LAB_TECH` role (already in `UserRole` enum and `ROLE_PERMISSIONS`) instead of adding `LAB_TECHNICIAN` — avoids unnecessary rename churn across the codebase.
- Created `labRestrictedProcedure` that extends `protectedProcedure` with lab context enrichment (queries `lab_technicians` → `labs` join).
- Lab registration uses `protectedProcedure` (not lab-restricted) because the registering user becomes a technician upon registration.
- Auth audit events use `baseProcedure` to allow logging failed login attempts (no valid JWT).
- IP addresses are SHA-256 hashed server-side for GDPR compliance.
- Email addresses in failed login audit events are redacted (`[REDACTED]`).

### Debug Log

No blocking issues encountered.

### Completion Notes

- All 5 tasks implemented with 29 tests (22 hub-api + 7 lab-lite).
- Pre-existing test failures in hub-api (6 files: auth-middleware, consent, health, medication, enforce-consent, jwt-auth) are unrelated to this story.
- Updated `LAB_TECHNICIAN` → `LAB_TECH` references in stories 12-1 and 12-2 for consistency with existing codebase enum.
- Added `LabStatus` enum to `shared-types` for `PENDING`/`ACTIVE`/`SUSPENDED` states.

## File List

### New Files
- `apps/hub-api/src/trpc/routers/lab.ts` — Lab domain router (register + reportAuthEvent)
- `apps/hub-api/src/trpc/middleware/enforceLabActive.ts` — Lab status gate middleware
- `apps/hub-api/src/__tests__/lab-rbac.test.ts` — Lab RBAC procedure tests (6 tests)
- `apps/hub-api/src/__tests__/lab-register.test.ts` — Lab registration endpoint tests (6 tests)
- `apps/hub-api/src/__tests__/lab-status-gate.test.ts` — Lab status gate tests (4 tests)
- `apps/hub-api/src/__tests__/lab-audit.test.ts` — Auth audit integration tests (6 tests)
- `apps/lab-lite/src/app/login/page.tsx` — Login page with TOTP MFA flow
- `apps/lab-lite/src/lib/supabase.ts` — Supabase browser client for lab-lite
- `apps/lab-lite/src/__tests__/login-page.test.tsx` — Login page tests (7 tests)
- `supabase/migrations/006_lab_tables.sql` — Migration for labs and lab_technicians tables

### Modified Files
- `apps/hub-api/src/trpc/rbac.ts` — Added `labRestrictedProcedure`, `LabContext` interface
- `apps/hub-api/src/trpc/routers/_app.ts` — Wired lab router into root router
- `packages/shared-types/src/enums.ts` — Added `LabStatus` enum
- `_bmad-output/implementation-artifacts/12-1-lab-credentialing-technician-auth.md` — Story updates
- `_bmad-output/implementation-artifacts/12-2-restricted-patient-verification.md` — LAB_TECHNICIAN → LAB_TECH

## Change Log

- 2026-04-30: Implemented Story 12.1 — Lab Credentialing & Technician Authentication. All 5 tasks complete, 29 tests added.

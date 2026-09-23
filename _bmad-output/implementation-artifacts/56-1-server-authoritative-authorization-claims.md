# Story 56.1: Server-Authoritative Authorization Claims (app_metadata Migration)

Status: review

## Story

As a platform security owner,
I want role, org, facility, and account-status claims to be server-authoritative (stored in Supabase `app_metadata` or resolved from the database), never derived from user-writable `user_metadata`,
so that no authenticated user — including a patient with an OTP session — can escalate their own privileges or clear their own suspension.

## Acceptance Criteria

1. **Given** any JWT presented to the Hub, **when** `createContext` builds `ctx.user`, **then** `role`, `orgId`, `facilityId`, and `status` are read exclusively from `app_metadata` (or a server-side DB lookup) — `user_metadata` is never consulted for authorization.
2. **Given** a token whose `user_metadata` contains `{ role: 'ADMIN' }` but whose `app_metadata` carries no ADMIN role, **when** any `adminProcedure` or role-restricted procedure is called, **then** the request is rejected with FORBIDDEN and the attempt is auditable.
3. **Given** a SUSPENDED user who rewrites their own `user_metadata.status`, **when** they call any protected procedure, **then** the suspension check still blocks them (status is server-authoritative).
4. **Given** every user-provisioning path (admin createUser, practitioner registration, patient registration/OTP), **when** a user is created or their role changes, **then** the authorization claims are written to `app_metadata` via the service-role client.
5. **Given** existing users provisioned under the old scheme, **when** the one-time migration runs, **then** their role/org/facility/status are copied from `user_metadata` to `app_metadata` and verified (count reconciliation), with no user losing access.
6. **Given** the binary-file routes and all client apps that parse the JWT for display/routing, **when** they read role claims, **then** they read the same `app_metadata` location (clients may still use claims for UX only — enforcement remains hub-side).
7. **Zero regression:** all pre-existing hub-api, admin-portal, and spoke tests pass; no existing feature or functionality is removed or degraded; every legitimate role (ADMIN, PHYSICIAN, PHARMACIST, LAB_TECH, PATIENT, GUARDIAN, etc.) retains exactly the access it had; `pnpm typecheck` passes across the monorepo.

## Tasks / Subtasks

- [x] **Task 1: Hub context hardening** (AC: 1, 2, 3)
  - [x] 1.1 Rewrite `apps/hub-api/src/trpc/init.ts:70-82` to derive `role`/`orgId`/`facilityId`/`status` from `payload.app_metadata` only. Remove every `userMeta.*` fallback for authorization fields.
  - [x] 1.2 Apply the same change to `apps/hub-api/src/app/api/lab-files/[fileId]/route.ts:47-53` and any other non-tRPC route that parses the JWT (grep for `user_metadata` across `apps/hub-api/src`).
  - [x] 1.3 Add a defense-in-depth check: if `app_metadata` role is missing but `user_metadata` claims one, log a security warning (opaque IDs only) and treat the user as unauthenticated for role-gated procedures.
- [x] **Task 2: Provisioning path migration** (AC: 4)
  - [x] 2.1 Update `admin.createUser` (`apps/hub-api/src/trpc/routers/admin.ts:2933` area) to write role/org/facility/status into `app_metadata` (service-role `auth.admin.updateUserById`).
  - [x] 2.2 Update `registration.ts:136` and `patient-registration.ts:275/507/641` identically.
  - [x] 2.3 Update role-change paths (`admin.updateUser`, lab staff role updates incl. the `update_lab_role_atomic` RPC callers) to mutate `app_metadata`.
- [x] **Task 3: Existing-user data migration** (AC: 5)
  - [x] 3.1 Write a one-time migration script (service role) that copies `user_metadata.{role,org_id,facility_id,status}` → `app_metadata` for all existing users; keep `user_metadata` values in place for now (display compatibility) but authorization no longer reads them.
  - [x] 3.2 Reconciliation report: count of users migrated per role; assert zero users with a role in `user_metadata` but none in `app_metadata` post-migration.
- [x] **Task 4: Client-side claim reads** (AC: 6)
  - [x] 4.1 Update `apps/admin-portal/src/components/AuthGuard.tsx:56-58` and `login/page.tsx:77-78` to read `app_metadata`; same for opd-lite/lab-lite/pharmacy-lite AuthGuards and login pages (grep `user_metadata` across `apps/*/src`).
  - [x] 4.2 Verify lab-lite's `ultranos_lab_role_<uid>` localStorage cache (`apps/lab-lite/src/components/AuthGuard.tsx:83`) refreshes correctly from the new claim source.
- [x] **Task 5: Tests** (AC: 2, 3, 7)
  - [x] 5.1 Hub test: forged `user_metadata.role=ADMIN` token → FORBIDDEN on `adminProcedure`, `patient-admin.*`, `sync.push`.
  - [x] 5.2 Hub test: `user_metadata.status` cleared but `app_metadata.status=SUSPENDED` → still blocked at `init.ts` suspension check.
  - [x] 5.3 Hub test: every role in `UserRole` resolves correctly from `app_metadata` (matrix test against `rbac.ts` ROLE_PERMISSIONS).
- [x] **Task 6: Regression verification** (AC: 7)
  - [x] 6.1 Run `pnpm typecheck` and the full hub-api test suite (165 files) plus admin-portal auth tests; all pre-existing tests pass unmodified (except tests that themselves asserted `user_metadata` reads, which are updated to the new contract).
  - [x] 6.2 Manual smoke: one login per role per app confirms unchanged access.

## Dev Notes

### Audit Findings Addressed

- **C-SYS-1 [V]** (docs/system-audit-2026-09-23.md §2): `init.ts:70-82` derives all authorization fields from `user_metadata`, which Supabase GoTrue lets any authenticated user rewrite via `supabase.auth.updateUser({ data: {...} })`. Patients receive live sessions at `patient-registration.ts:326`, so this is a patient→ADMIN escalation path. This is the single highest-severity finding in the audit — it undoes every downstream RBAC, consent, and data-minimization control.

### Architecture

- `app_metadata` is server-only writable (service role) — this is the canonical Supabase pattern for authorization claims. Alternative accepted by the audit: a custom access-token hook or per-request DB lookup; choose `app_metadata` unless a blocker emerges (fewer round trips, works offline-verified).
- Do NOT delete `user_metadata` copies in this story — other code may read them for display. Removing them is cleanup for a later story once grep shows zero readers.
- Coordinate with Story 56.3 (MFA policy enforcement): both touch `init.ts` context building — land this story first.
- Rule references: CLAUDE.md "Auth & Sessions"; audit §8 Theme 4 (documented-vs-implemented auth architecture).

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Every legitimate user keeps exactly their current access; every existing test passes; no endpoint's happy-path behavior changes for correctly-provisioned users. The only behavioral change permitted is the rejection of forged/self-modified claims (AC 2, 3). Run `pnpm typecheck` + full affected test suites before marking review.

### Project Structure Notes

**Files to modify:** `apps/hub-api/src/trpc/init.ts`, `apps/hub-api/src/app/api/lab-files/[fileId]/route.ts`, `apps/hub-api/src/trpc/routers/admin.ts`, `registration.ts`, `patient-registration.ts`, four apps' AuthGuard/login files.
**New files:** `apps/hub-api/scripts/migrate-auth-claims.ts` (or Supabase MCP-applied migration + script), `apps/hub-api/src/__tests__/authz-claims.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#2-systemic-critical-findings] — C-SYS-1 full evidence chain
- [Source: apps/hub-api/src/trpc/init.ts:60-90] — current claim derivation (verified in audit)
- [Source: apps/hub-api/src/trpc/rbac.ts] — ROLE_PERMISSIONS matrix
- [Source: _bmad-output/implementation-artifacts/6-1-role-based-access-control-rbac.md] — original RBAC story

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — completion & combined verification.

### Debug Log References
None. (A mid-run account spend-limit interrupted the first pass after implementation but before reporting; a second agent resumed the same worktree, verified, and reported.)

### Completion Notes List
- **Task 1:** New `resolveAuthzClaims()` + `AuthzClaims` in `lib/jwt.ts` is the single source of truth — role/org_id/facility_id/status come from `app_metadata` + server-signed top-level claims only; `user_metadata` is never consulted for authz. Task 1.3 defense-in-depth: a `user_metadata`-only role claim emits a `[SECURITY]` warn (opaque `{sub, sessionId}` only) and is ignored → RBAC fails closed. Wired into `init.ts` and **four** JWT-parsing routes (grep found 3 beyond the spec's cited lab-files route: `specimen-files/[fileId]`, `patient-photo`, `staff-photo`).
- **Task 2:** All provisioning sites now write `app_metadata` (via createUser's atomic `app_metadata` arg / `auth.admin.updateUserById`): `admin.createUser`, `admin.updateUser` role change, archive/restore/suspend/reactivate status writes, `registration.ts` org-admin createUser, all three `patient-registration.ts` sites. `user_metadata` display copies are retained per Task 3.1. Lab roles need no change — `update_lab_role_atomic` mutates the `lab_technicians` column and `labRestrictedProcedure` resolves it via DB lookup (already server-authoritative).
- **Task 3:** `scripts/migrate-auth-claims.ts` written, **not run** — pages `auth.admin.listUsers`, copies authz fields user_metadata→app_metadata (app_metadata always wins, protects subscription-lifecycle statuses), idempotent, `--dry-run` mode, reconciliation report asserting zero users with a user_metadata role but no app_metadata role. Logs opaque ids/counts only.
- **Task 4:** Client reads updated to app_metadata-first with a temporary user_metadata fallback on the display/routing path only (so existing sessions survive the migration window): admin-portal AuthGuard+login (both password and MFA paths), opd-lite AuthGuard+login, pharmacy-lite AuthGuard+login, lab-lite login. lab-lite `ultranos_lab_role_<uid>` cache verified to refresh from DB-resolved `lab.getMyRole`.
- **Task 5:** `authz-claims.test.ts` (19 tests): forged `user_metadata.role=ADMIN` rejected on adminProcedure / patient-admin.getById / sync.push; security-warning emission (opaque-id assertion); `app_metadata.status=SUSPENDED` blocks even with rewritten user_metadata; full UserRole matrix from app_metadata cross-checked against ROLE_PERMISSIONS.
- **Task 6:** Combined-tree regression green (see verification below). Retained top-level `payload.role/org_id/facility_id` fallbacks are GoTrue/custom-hook-minted (server-signed, not user-writable) — for real user tokens top-level role is `authenticated` → no access (fail-safe). Three existing hub test files updated to the new contract (allowed by Task 6.1).
- **DEPLOY NOTE:** run `migrate-auth-claims.ts` (dry-run first) before/with the hub deploy; until a user's app_metadata is populated and their token refreshes (≤15 min) they resolve as unprivileged. Client display keeps working via the fallback.

### Verification (combined `audit-sep-23-improvements` tree)
- `pnpm -F hub-api typecheck` → clean; opd-lite / pharmacy-lite / lab-lite / admin-portal typecheck → clean.
- `pnpm -F hub-api test` → 160 files, 1679 pass, 3 todo, 0 fail (co-resident with 57.1/59.1/60.2/59.2-T1).
- App auth suites (admin/opd/pharmacy/lab AuthGuard + login) → all pass.

### File List
Modified — `apps/hub-api/src/lib/jwt.ts`, `src/trpc/init.ts`, `src/trpc/routers/admin.ts`, `src/trpc/routers/patient-registration.ts`, `src/trpc/routers/registration.ts`, `src/app/api/lab-files/[fileId]/route.ts`, `src/app/api/patient-photo/route.ts`, `src/app/api/specimen-files/[fileId]/route.ts`, `src/app/api/staff-photo/route.ts`, `src/__tests__/diagnostic-report-download.test.ts`, `src/__tests__/patient-photo-route.test.ts`, `src/__tests__/specimen-file-download.test.ts`; `apps/admin-portal/src/app/[locale]/login/page.tsx`, `src/components/AuthGuard.tsx`; `apps/opd-lite/src/app/[locale]/(auth)/login/page.tsx`, `src/components/AuthGuard.tsx`; `apps/pharmacy-lite/src/app/[locale]/(auth)/login/page.tsx`, `src/components/AuthGuard.tsx`; `apps/lab-lite/src/app/[locale]/(auth)/login/page.tsx`.
New — `apps/hub-api/scripts/migrate-auth-claims.ts`, `apps/hub-api/src/__tests__/authz-claims.test.ts`.

### Change Log
- 2026-09-23: Story 56.1 implemented (Wave 1). All 6 tasks complete + combined-tree verified. Migration script staged (not run). Status → review.

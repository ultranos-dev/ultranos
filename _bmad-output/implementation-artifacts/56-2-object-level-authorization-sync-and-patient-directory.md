# Story 56.2: Object-Level Authorization & Consent on sync.pull/push + Patient Directory Restriction

Status: ready-for-dev

## Story

As a platform security owner,
I want `sync.pull`/`sync.push` to enforce object-level ownership, org scoping, and consent — and `patient.list`/`patient.search` to be restricted to clinical/admin roles,
so that no caller can read another patient's record, overwrite another org's data, or enumerate the patient registry beyond their legitimate scope.

## Acceptance Criteria

1. **Given** a PATIENT or GUARDIAN role calls `sync.pull`, **when** the supplied `patientId` is not their own record (or their linked ward for guardians), **then** the request is rejected with FORBIDDEN and audited.
2. **Given** a clinician calls `sync.pull` for a patient whose consent is withdrawn/expired, **when** the pull executes, **then** consent-gated resource types are excluded per the same policy `enforceConsentMiddleware` applies elsewhere, and the denial is audited.
3. **Given** `sync.push` receives an operation whose `resourceId` already exists, **when** the existing row belongs to a different org (or a patient the caller has no relationship with), **then** the write is rejected — the HLC comparison alone can never authorize an overwrite, and `org_id` of an existing row is never re-stamped to the caller's org.
4. **Given** a PATIENT or GUARDIAN role calls `patient.list` or `patient.search`, **then** the call is rejected — these roles use their own-record endpoints only.
5. **Given** a clinician calls `patient.list`/`patient.search`, **then** results respect the platform tenancy model (free-floating patients per Epic 27 decisions — document the chosen scoping in the router), and `national_id_hash` and raw `photo_url` storage paths are removed from the response shape.
6. **Given** the previously imported-but-unused `enforceResourceAccess` in `sync.ts:4`, **then** it is either applied or removed — no dead security imports remain.
7. **Zero regression:** all legitimate sync flows (OPD full pull/push, pharmacy dispense push, lab result push) work unchanged for authorized callers; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded for authorized users.

## Tasks / Subtasks

- [ ] **Task 1: sync.pull caller scoping** (AC: 1, 2)
  - [ ] 1.1 In `apps/hub-api/src/trpc/routers/sync.ts:593-720`: add role-specific ownership resolution — PATIENT → own patient id only; GUARDIAN → linked wards via guardian links; clinical roles → org/consent policy.
  - [ ] 1.2 Add consent gating consistent with `enforceConsentMiddleware` usage in `encounter.ts:196` / `diagnostic-report.ts:37`.
  - [ ] 1.3 Emit audit events for denials (opaque IDs only).
- [ ] **Task 2: sync.push existing-row ownership** (AC: 3)
  - [ ] 2.1 Before the upsert at `sync.ts:472-479`, fetch the existing row's `org_id`/patient linkage; reject cross-org/cross-patient overwrites with CONFLICT/FORBIDDEN.
  - [ ] 2.2 Remove the org re-stamp behavior at `sync.ts:422-432` for existing rows (creates keep caller org).
- [ ] **Task 3: patient.list / patient.search restriction** (AC: 4, 5)
  - [ ] 3.1 In `apps/hub-api/src/trpc/routers/patient.ts:37-337`: reject PATIENT/GUARDIAN; keep clinician access per tenancy decision; strip `national_id_hash` and raw `photo_url` path from output schemas.
  - [ ] 3.2 Verify opd-lite/pharmacy-lite patient search UIs still function (they authenticate as clinicians).
- [ ] **Task 4: Tests** (AC: 1-6)
  - [ ] 4.1 Extend `sync-pull-scoping.test.ts` (currently column-filtering only, `:100-146`): PATIENT pulls other patient → FORBIDDEN; GUARDIAN ward vs non-ward; consent-withdrawn exclusion.
  - [ ] 4.2 Push tests: cross-org overwrite rejected even with newer HLC; org_id not re-stamped; legitimate same-org update still succeeds.
  - [ ] 4.3 Directory tests: PATIENT role rejected on list/search; response shape excludes forbidden fields.
- [ ] **Task 5: Regression verification** (AC: 7)
  - [ ] 5.1 Run full hub-api suite + opd-lite sync tests; verify OPD SyncProvider round-trip (push→pull) still succeeds for a clinician fixture; `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **C-SYS-2 [V]** (audit §2): pull checks only `hasResourceAccess(role, type)` then `select('*')` for a client-supplied patientId — no consent, no ownership, no org scoping; push upserts on client-supplied resourceId with no existing-row ownership check and re-stamps `org_id` (verified `sync.ts` greps: only `hasResourceAccess` at 206/602/622; `enforceResourceAccess` imported line 4, never used).
- **C-HUB-4 [A]** (audit §3): `patient.list/search` return names, DOB, phone, addresses, blood group, `national_id_hash`, raw photo path to PATIENT/GUARDIAN roles, which hold `Patient` in `rbac.ts:52-63`.

### Architecture

- Respect conflict semantics: rejecting a push for authorization reasons must return a distinguishable error (not a sync "conflict") so spoke drain workers dead-letter rather than retry forever — check `packages/sync-engine/src/drain-worker.ts` permanent-vs-transient classification.
- Tier-1 append-only behavior (Rule #5) is untouched by this story — do not alter conflict resolution logic here (that is Story 60.2).
- Depends on Story 56.1 (trustworthy role claims). Land 56.1 first.
- Tenancy scoping must align with the Epic 27 locked decisions (shared-schema RLS, free-floating patients) — document the chosen clinician scope in code comments.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Every authorized sync flow and patient search continues to work identically; the only behavior change is denial of previously-unauthorized access (AC 1-4). All pre-existing tests pass; `pnpm typecheck` clean. Verify OPD offline→online sync end-to-end before review.

### Project Structure Notes

**Files to modify:** `apps/hub-api/src/trpc/routers/sync.ts`, `patient.ts`; possibly `middleware/enforceResourceAccess.ts` / new `enforceOwnership` helper.
**Tests:** `apps/hub-api/src/__tests__/sync-pull-scoping.test.ts` (extend), new `sync-push-ownership.test.ts`, `patient-directory-access.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#2-systemic-critical-findings] — C-SYS-2, C-HUB-4
- [Source: apps/hub-api/src/trpc/routers/sync.ts:422-432,472-479,593-720]
- [Source: apps/hub-api/src/trpc/middleware/] — enforceConsentMiddleware pattern (see encounter.ts:196)
- [Source: C:\Users\malan\.claude\...memory project_subscription_tenancy] — Epic 27 tenancy decisions

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

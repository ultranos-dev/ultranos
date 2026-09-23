# Story 59.4: Appointments Repair (RBAC Entry, Sync-Queue Routing, Orphaned Procedures)

Status: ready-for-dev

## Story

As an OPD clinician scheduling patients,
I want appointments to be a first-class citizen of the platform's architecture — authorized in RBAC, synced through the durable queue with real HLC stamps, with failures surfaced — and the orphaned appointment procedures either wired or removed,
so that offline-created appointments are never lost and the feature's hub surface matches reality.

## Acceptance Criteria

1. **Given** `rbac.ts` ROLE_PERMISSIONS, **then** `'Appointment'` is granted to the appropriate clinical roles (currently absent → `enforceResourceAccess('Appointment')` forbids every non-ADMIN caller), and `appointment.listByPatient` gains an ownership/facility scoping check.
2. **Given** an appointment is created/updated/cancelled in OPD (online or offline), **when** the write happens, **then** it is stamped with a real serialized HLC (`serializeHlc(hlc.now())` — not `Date.now().toString()`) and routed through the durable sync queue like every other clinical resource, draining on reconnect without requiring the appointments page to be open.
3. **Given** an appointment batch sync fails, **then** the failure is surfaced (sync status/dead-letter), not silently swallowed as `{synced: 0}`.
4. **Given** the orphaned hub procedures (`appointment.create`, `appointment.updateStatus`, `appointment.slot.listByPractitioner`, `appointment.slot.generateDaily`), **then** each is either wired to a real client flow or removed — with the decision recorded (slots/generateDaily likely future scheduling scope: keep-and-document or delete cleanly).
5. **Given** the LWW week-merge, **then** it compares homogeneous HLC formats only (no 13-digit-ms vs serialized-HLC lexicographic comparisons).
6. **Zero regression:** the appointments UI (create/edit/views), the double-booking check, and Tier-3 LWW semantics on the hub are unchanged for users; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded (procedure removals require confirmed zero callers, per the contract inventory from Story 59.2).

## Tasks / Subtasks

- [ ] **Task 1: RBAC + scoping** (AC: 1) — add `Appointment` to `rbac.ts:15-70` role sets; ownership check in `appointment.ts:283-296`; tests per role.
- [ ] **Task 2: HLC + queue routing** (AC: 2, 5) — `apps/opd-lite/src/hooks/useAppointments.ts:116,182,228` (fake HLC) and the LWW merge at `:372`: stamp real HLCs; route mutations through `enqueueSyncAction` (pattern: `stores/lab-order-store.ts:94-100`); migration handling for locally-stored appointments carrying ms-string stamps (normalize on read or re-stamp).
- [ ] **Task 3: Failure surfacing** (AC: 3) — `lib/trpc.ts:66-71` `syncAppointmentBatch`: propagate failure to the sync status store; retry via the queue's backoff instead of page-mount luck.
- [ ] **Task 4: Orphan disposition** (AC: 4) — wire or remove the four procedures; update `_app.ts`; record decision in this story file.
- [ ] **Task 5: Tests + regression verification** (AC: 6) — offline-create → reconnect → drained; mixed-format merge test; role matrix; full OPD + hub appointment suites (note: `appointment.ts` is the ONLY hub router with zero tests — this story adds its first real coverage); `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **M-HUB-6 [A]** (Appointment absent from ROLE_PERMISSIONS; listByPatient unscoped), **H-OPD-3 [A]** (Date.now() HLC + queue bypass + silent batch failures + mis-ordered merges), **orphaned endpoints [V]** (audit §9 — only `appointment.syncBatch` has a caller, verified `lib/trpc.ts:57`), hub test-inventory gap (audit §3: appointment.ts is the sole untested router).

### Architecture

- Appointments are Tier-3 (LWW) per the conflict table — correct; this story fixes the *stamps* feeding that LWW, not the tier.
- CLAUDE.md priority order puts appointments in the metadata band — fine; queue routing still applies.
- Coordinate with Story 60.1 (HLC discipline) — use the same shared `hlcNow()` helper it establishes; if 60.1 lands first, this story consumes it.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. The appointments UX is unchanged; scheduling, double-booking checks, and existing data continue to work (including data migration for old timestamps). All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** hub `rbac.ts`, `appointment.ts`, `_app.ts`; opd-lite `hooks/useAppointments.ts`, `lib/trpc.ts`, sync status store.
**New files:** `apps/hub-api/src/__tests__/appointment.test.ts`, `apps/opd-lite/src/__tests__/appointment-sync.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#4-opd-lite-appsopd-lite] — H-OPD-3
- [Source: docs/system-audit-2026-09-23.md#9-inter-app-workflow-status] — workflow 5 + orphaned endpoints
- [Source: apps/opd-lite/src/stores/lab-order-store.ts:94-100] — correct enqueue pattern to copy

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Change Log

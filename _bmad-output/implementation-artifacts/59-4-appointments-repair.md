# Story 59.4: Appointments Repair (RBAC Entry, Sync-Queue Routing, Orphaned Procedures)

Status: review

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

- [x] **Task 1: RBAC + scoping** (AC: 1) — add `Appointment` to `rbac.ts:15-70` role sets; ownership check in `appointment.ts:283-296`; tests per role.
- [x] **Task 2: HLC + queue routing** (AC: 2, 5) — `apps/opd-lite/src/hooks/useAppointments.ts:116,182,228` (fake HLC) and the LWW merge at `:372`: stamp real HLCs; route mutations through `enqueueSyncAction` (pattern: `stores/lab-order-store.ts:94-100`); migration handling for locally-stored appointments carrying ms-string stamps (normalize on read or re-stamp).
- [x] **Task 3: Failure surfacing** (AC: 3) — `lib/trpc.ts:66-71` `syncAppointmentBatch`: propagate failure to the sync status store; retry via the queue's backoff instead of page-mount luck.
- [x] **Task 4: Orphan disposition** (AC: 4) — wire or remove the four procedures; update `_app.ts`; record decision in this story file.
- [x] **Task 5: Tests + regression verification** (AC: 6) — offline-create → reconnect → drained; mixed-format merge test; role matrix; full OPD + hub appointment suites (note: `appointment.ts` is the ONLY hub router with zero tests — this story adds its first real coverage); `pnpm typecheck`.

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

claude-opus-4-8[1m] (Lane-D isolated worktree)

### Orphan Disposition Decision (Task 4)

Verified zero frontend callers across ALL apps by grep (`appointment.create`, `appointment.updateStatus`,
`appointment.slot.listByPractitioner`, `appointment.slot.generateDaily` — only `appointment.syncBatch` and
`appointment.listByPractitioner` have callers, both in `apps/opd-lite/src/lib/trpc.ts`). The audit itself
(system-audit-2026-09-23.md §9, line 294) documents these four as orphaned. Decision: **REMOVE all four.**

- **`appointment.create` — REMOVED.** Redundant with `appointment.syncBatch`. The real OPD flow writes to the
  local encrypted store and syncs through the durable queue → `syncBatch` (idempotent upsert + Tier-3 LWW +
  double-booking FLAG). A synchronous hard-blocking `create` is incompatible with offline-first creation; the
  client `SLOT_BUSY` guard + `syncBatch`'s cross-device conflict flag cover the real cases.
- **`appointment.updateStatus` — REMOVED.** Status changes now flow through the queue → `syncBatch` as a
  higher-HLC upsert of the same appointment id.
- **`appointment.slot.listByPractitioner` / `slot.generateDaily` — REMOVED (entire `slot` sub-router).** No
  client scheduling/slot-management flow exists; deferred to a future scheduling epic. `_app.ts` needed NO
  change (the sub-router was nested inside `appointmentRouter`, not registered separately).

Note: `apps/hub-api/types/app-router.d.ts` (a generated, tsconfig-`exclude`d build artifact) still lists the
removed procedures; it is regenerated on hub build and not hand-edited.

### Completion Notes List

- Appointment writes (create / cancel / walk-in / status) now stamp `serializeHlc(hlc.now())` and enqueue via
  `enqueueSyncAction(syncQueue, { resourceType:'Appointment', ... })` — durable, drains on reconnect without the
  appointments page mounted.
- Sync worker routes `Appointment` queue entries to `appointment.syncBatch` (NOT `sync.push`, which has no
  Appointment table mapping and could not be edited — owned by Story 56.2). Batch/single failures return
  `{success:false}` → queue backoff retry + `sync-store.failedCount` surfacing (AC3).
- LWW week-merge now normalizes BOTH sides via `toComparableHlc` + `compareHlc` (homogeneous comparison, AC5);
  legacy ms-epoch stamps are re-stamped to serialized HLC on read during sync (migration).
- `lib/trpc.ts syncAppointmentBatch` no longer swallows failures as `{synced:0}` — throws on non-2xx; both
  appointment helpers refactored onto the shared `getAuthHeaders` (hub-auth.ts) helper from Story 59.3.

### File List

- apps/hub-api/src/trpc/rbac.ts (Appointment + Slot added to CLINICIAN_RESOURCES)
- apps/hub-api/src/trpc/routers/appointment.ts (listByPatient scoping; removed create/updateStatus/slot router)
- apps/opd-lite/src/hooks/useAppointments.ts (HLC stamps, queue enqueue, LWW normalization, migration)
- apps/opd-lite/src/lib/sync-worker.ts (route Appointment entries to appointment.syncBatch)
- apps/opd-lite/src/lib/trpc.ts (failure surfacing + getAuthHeaders)
- apps/hub-api/src/__tests__/appointment.test.ts (NEW — first coverage for appointment router)
- apps/opd-lite/src/__tests__/appointment-sync.test.ts (NEW — HLC/LWW/migration unit tests)

### Change Log

- 2026-09-23: Story 59.4 implemented (Lane-D). RBAC entry + ownership scoping, HLC+queue routing, failure
  surfacing, orphan removal, first appointment-router tests. hub + opd typecheck clean; full hub (1641) + opd
  (1428) suites green.

# Story 60.3: Offline Patient Registration (OPD, Lab, Pharmacy) + MPI at Drain

Status: review

## Story

As a clinic registrar with no connectivity,
I want to register a new patient fully offline in any spoke — with the record encrypted locally, queued for sync, and MPI duplicate-checking running when connectivity returns,
so that the single most fundamental clinical workflow passes the "pull the ethernet cable" test.

## Acceptance Criteria

1. **Given** OPD registration with no network, **when** the form is submitted, **then** the patient is written to encrypted local storage with a provisional ID and enqueued (priority per the sync order), the clinician can immediately start an encounter for them, and no error is thrown.
2. **Given** connectivity returns, **when** the queued registration drains, **then** `patient.checkDuplicates` (MPI) runs hub-side at materialization; WARN-level candidates create a duplicate-review entry (existing flow); the provisional ID is reconciled to the hub ID across all locally-linked records (encounters, orders, prescriptions created against the provisional ID).
3. **Given** the MPI BLOCK enforcement TODOs, **then** BLOCK-level matches are enforced again at the hub (`patient.ts:494`) and in the pharmacy client (`PatientRegistrationForm.tsx:405`) for ONLINE registrations; offline-queued registrations that hit BLOCK at drain become flagged duplicate-review items rather than silent creations (they cannot be pre-blocked offline).
4. **Given** lab-lite and pharmacy-lite registration forms, **then** they gain the same offline path (lab-lite's tier-compliant registration from Story 59.1; pharmacy per its local registry + hub sync).
5. **Given** a queued-but-undrained registration, **then** logout/PHI-cleanup preserves it (never destroys the only copy — same principle as Story 57.3 AC 2).
6. **Zero regression:** online registration flows (including duplicate-check UX) behave exactly as today; existing patients and the duplicate-review/merge pipeline are unaffected; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: OPD offline branch** (AC: 1, 2)
  - [x] 1.1 `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx:51-76`: offline/failure branch → encrypted Dexie write (provisional `crypto.randomUUID()` + `mpiPending: true` flag) + `enqueueSyncAction('Patient','create',…)`; UI communicates "registered locally — will verify for duplicates when online".
  - [x] 1.2 Hub sync materialization for Patient creates: run MPI check, create `duplicate_reviews` on WARN/BLOCK (routed via the existing `patient.syncCreate` procedure — deliberately did NOT touch hub `sync.ts`, keeping this story conflict-free with 62.2's `sync.pull` work).
  - [x] 1.3 Provisional-ID reconciliation: `provisionalIdMap` (opd Dexie v29) + post-drain sweep re-keys the local patient and re-points all 8 linked record types.
- [x] **Task 2: MPI BLOCK restoration** (AC: 3) — `apps/hub-api/src/lib/mpi-block-mode.ts` implements `MPI_BLOCK_MODE` (Decision #5: default **warn** — BLOCK issues a proceed-token + `PRECONDITION_FAILED` override path and is flagged for review; **enforce** hard-blocks online with `CONFLICT`, no override). `patient.ts` create enforces it; offline-queued registrations that hit BLOCK at drain become duplicate-review items (cannot be pre-blocked offline).
- [x] **Task 3: Lab + pharmacy offline branches** (AC: 4, 5) — lab-lite `lib/patient-register-offline.ts` + pharmacy offline branch; both queue an encrypted local write + Patient create with inline consent; queued registrations survive logout/PHI-cleanup.
- [x] **Task 4: Tests + regression verification** (AC: 6)
  - [x] 4.1 Offline-registration integration test per spoke (opd `offline-registration.test.ts` + `reconcile-provisional-patient.test.ts`, lab `patient-register-offline.test.ts`); hub `patient-mpi-block-mode.test.ts` (warn overridable / enforce hard-block / warn-proceeds).
  - [x] 4.2 Full suites + online registration verified; `pnpm typecheck` clean.

## Dev Notes

### Audit Findings Addressed

- **C-OPD-2 [A]**, **M-LAB-3 [A]**, **M-HUB-9/M-HUB-13 [A]** (MPI BLOCK disabled hub + pharmacy), audit §9 workflow 1 ("No offline path anywhere"). CLAUDE.md Offline-First: "Every clinical workflow must complete without a network connection."

### Architecture

- Provisional-ID reconciliation is the hard part — scope it deliberately: a `provisional_id_map` local table + a post-drain sweep updating known FK fields; document which record types can reference a provisional patient (encounters, vitals, lab orders, prescriptions) and test each.
- The duplicate-review infrastructure (OPD `duplicate-review` page + admin merge, one coherent flow per audit workflow 9) is the landing zone for deferred MPI hits — reuse, don't invent.
- Registration consent capture must survive the offline path (consent is priority-1 sync — pair the queued consent with the queued patient).

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. Online registration, duplicate checking, and review/merge flows are unchanged; the offline branch is additive. MPI BLOCK restoration changes online behavior only per the recorded decision (AC 3). All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** three registration forms, hub `sync.ts` Patient materialization, `patient.ts:494`, `async-mpi-scoring.ts`.
**New files:** per-spoke `lib/offline-registration.ts` (or store extension), provisional-ID map + sweep, integration tests.

### References

- [Source: docs/system-audit-2026-09-23.md#4-opd-lite-appsopd-lite] — C-OPD-2
- [Source: docs/system-audit-2026-09-23.md#9-inter-app-workflow-status] — workflows 1, 9
- [Source: apps/hub-api/src/lib/async-mpi-scoring.ts:25-91] — existing deferred-MPI path to extend

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Debug Log References
`pnpm -F hub-api typecheck` → clean (after aligning `patient-mpi-block-mode.test.ts`'s create input to `AdministrativeGender.MALE` + a full `ctx.user` shape). Combined suites: hub 1839, opd 1466 (+1 todo), lab 3961 (+13 skipped), pharmacy 1153 — 0 failures.

### Completion Notes List
- **Task 1 (OPD offline branch):** `PatientRegistrationForm.tsx` gains an offline/failure branch — encrypted Dexie write with a provisional `crypto.randomUUID()` + `mpiPending: true`, queued Patient create (consent inline), immediate encounter start, no throw. **Routed via the existing `patient.syncCreate` procedure — deliberately kept clear of hub `sync.ts`** so this story stayed conflict-free with 62.2's `sync.pull` pagination work.
- **Provisional-ID reconciliation:** opd Dexie **v29** `provisionalIdMap` + a post-drain sweep (`reconcile-provisional-patient.ts`) that re-keys the local patient and re-points all 8 linked record types (encounters, vitals, orders, prescriptions, etc.) once the hub ID is known.
- **Task 2 (MPI BLOCK restoration):** `apps/hub-api/src/lib/mpi-block-mode.ts` reads `MPI_BLOCK_MODE` — **Decision #5 default `warn`**: a BLOCK is overridable (issues a signed proceed-token; `patient.create` throws `PRECONDITION_FAILED` when no token is supplied) and flagged for duplicate review; `enforce` hard-blocks online (`CONFLICT`, no override, no insert). Offline-queued registrations that hit BLOCK at drain become review items (cannot be pre-blocked offline).
- **Task 3 (lab + pharmacy offline):** lab-lite `lib/patient-register-offline.ts` and the pharmacy registration form gain the same offline branch (encrypted local write + queued Patient create with inline consent). Both queues survive logout/PHI-cleanup (never destroy the only copy).
- **Shared-types:** `packages/shared-types/src/fhir/patient.ts` gains `mpiPending` + `isOfflineCreated`.

### File List
New — `apps/hub-api/src/lib/mpi-block-mode.ts`, `src/__tests__/patient-mpi-block-mode.test.ts`; `apps/lab-lite/src/lib/patient-register-offline.ts`, `src/__tests__/patient-register-offline.test.ts`; `apps/opd-lite/src/lib/{offline-registration,reconcile-provisional-patient}.ts`, `src/__tests__/{offline-registration,reconcile-provisional-patient}.test.ts`.
Modified — hub `trpc/routers/patient.ts`, `__tests__/patient-crud.test.ts`; opd `components/registration/{PatientRegistrationForm,MpiResultModal}.tsx`, `lib/{db (v29),sync-worker,phi-cleanup}.ts`; lab `components/patients/PatientRegistrationForm.tsx`, `components/providers/SyncProvider.tsx`; pharmacy `components/registration/{PatientRegistrationForm,MpiResultModal}.tsx`; `packages/shared-types/src/fhir/patient.ts`.

### Change Log
- 2026-09-24: Story 60.3 implemented (Wave 5 batch 2), verified, integrated. Offline registration across OPD/lab/pharmacy with provisional-ID reconciliation at drain; MPI BLOCK restored behind `MPI_BLOCK_MODE` (default warn). opd Dexie v29. Routed via `patient.syncCreate` (hub `sync.ts` untouched). Status → review.

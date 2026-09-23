# Story 60.3: Offline Patient Registration (OPD, Lab, Pharmacy) + MPI at Drain

Status: ready-for-dev

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

- [ ] **Task 1: OPD offline branch** (AC: 1, 2)
  - [ ] 1.1 `apps/opd-lite/src/components/registration/PatientRegistrationForm.tsx:51-76`: offline/failure branch → encrypted Dexie write (provisional `crypto.randomUUID()` + `mpiPending: true` flag) + `enqueueSyncAction('Patient','create',…)`; UI communicates "registered locally — will verify for duplicates when online".
  - [ ] 1.2 Hub sync materialization for Patient creates: run MPI check, create `duplicate_reviews` on WARN/BLOCK (extends the existing `async-mpi-scoring.ts` path — coordinate with Story 60.4's stranding fix).
  - [ ] 1.3 Provisional-ID reconciliation: map provisional→hub ID on drain ack; update locally-linked records (define the mapping table + sweep; the sync engine's `getLatestSynced` and existing reconcile patterns are precedents).
- [ ] **Task 2: MPI BLOCK restoration** (AC: 3) — hub `patient.ts:494` TODO + pharmacy `PatientRegistrationForm.tsx:405` TODO; decision point if MPI scoring is still deemed not-production-ready (the TODO's stated reason) — in that case implement behind `MPI_BLOCK_MODE=warn|enforce` and record the decision.
- [ ] **Task 3: Lab + pharmacy offline branches** (AC: 4, 5) — same pattern; lab-lite depends on Story 59.1's endpoints for the drain target; pharmacy's local registry (`patient-register.ts`) gains queue + audit emission (audit gap M-PHARM-4 covers the audit event — coordinate with Story 61.1).
- [ ] **Task 4: Tests + regression verification** (AC: 6)
  - [ ] 4.1 Offline-registration integration test per spoke (simulated disconnection mid-operation per CLAUDE.md testing requirements); drain reconciliation test; BLOCK-at-drain → review item.
  - [ ] 4.2 Full suites + online registration manual check; `pnpm typecheck`.

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

### Debug Log References

### Completion Notes List

### File List

### Change Log

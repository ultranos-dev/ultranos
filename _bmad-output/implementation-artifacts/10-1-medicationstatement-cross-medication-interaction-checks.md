# Story 10.1: MedicationStatement & Cross-Medication Interaction Checks

Status: done

## Story

As a clinician,
I want to be warned of interactions against the patient's entire medication history,
so that I can ensure safety beyond the current visit.

## Context

The drug interaction checker (Story 3.2) only compares new prescriptions against the current encounter's pending prescriptions. A patient on chronic warfarin from a prior visit can be prescribed aspirin without any warning — the checker doesn't see warfarin because it's not in the current encounter's prescription list.

This story creates the `MedicationStatement` FHIR resource (representing a patient's active/chronic medications) and wires it into the interaction checker so ALL active medications are checked, not just the current encounter's pending prescriptions.

**PRD Requirements:** FR7 (Drug Interaction Check), PRD Section 20.2, CLAUDE.md Rule #3

**Depends on:** Story 10.2 (AllergyIntolerance schema and allergy store — needed for cross-referencing allergy data during interaction checks).

## Acceptance Criteria

1. [ ] A FHIR `MedicationStatement` Zod schema exists in `packages/shared-types/src/fhir/medication-statement.schema.ts`.
2. [ ] The Hub API tracks `MedicationStatement` records for each patient — representing their chronic/active medications across all encounters.
3. [ ] When a prescription (`MedicationRequest`) is marked as dispensed, a corresponding `MedicationStatement` is created or updated with status `active`.
4. [ ] When a prescription is voided or completed, the `MedicationStatement` status transitions to `completed` or `stopped`.
5. [ ] The interaction checker compares new prescriptions against BOTH:
   - Pending prescriptions in the current encounter (existing behavior)
   - Active `MedicationStatement` records for the patient (new behavior)
6. [ ] The interaction checker also compares against the patient's active allergies from Story 10.2 (`ALLERGY_MATCH` severity).
7. [ ] The interaction checker uses **medication codes** (not display names) for matching when codes are available, falling back to display name matching.
8. [ ] Active medications are loaded from the Hub API on encounter start and cached locally in Dexie for offline checks.
9. [ ] The interaction checker's "check unavailable" fallback (CLAUDE.md Rule #3) is preserved — if MedicationStatement data can't be loaded, the warning "Full medication history unavailable — interaction check limited to current encounter" is shown.
10. [ ] Tests cover: cross-encounter interaction detection (warfarin + aspirin scenario), allergy match detection, code-based matching, display-name fallback, and "history unavailable" fallback.

## Tasks / Subtasks

- [x] **Task 1: MedicationStatement FHIR Schema** (AC: 1)
  - [x] Create `packages/shared-types/src/fhir/medication-statement.schema.ts`.
  - [x] Fields per FHIR R4: `id`, `status` (active/completed/entered-in-error/intended/stopped/on-hold), `medicationCodeableConcept` (CodeableConcept — drug code + display), `subject` (patient reference), `effectivePeriod` (start/end dates), `dateAsserted`, `informationSource` (reference to practitioner/patient).
  - [x] Ultranos extensions in `_ultranos`: `createdAt`, `sourceEncounterId`, `sourcePrescriptionId`.
  - [x] Export from `packages/shared-types/src/fhir/index.ts`.

- [x] **Task 2: Hub API MedicationStatement Endpoints** (AC: 2, 3, 4)
  - [x] Create `hub-api/src/trpc/routers/medication-statement.ts`:
    - `medicationStatement.listActive` — returns active MedicationStatements for a patient. RBAC: CLINICIAN, ADMIN.
    - `medicationStatement.create` — creates a new MedicationStatement. RBAC: CLINICIAN. Emits audit event.
    - `medicationStatement.updateStatus` — transitions status (active → completed/stopped). RBAC: CLINICIAN. Emits audit event.
  - [x] Create Supabase migration for `medication_statements` table.
  - [x] Apply field-level encryption to medication free-text fields via `db.toRow()`.

- [x] **Task 3: Prescription → MedicationStatement Lifecycle** (AC: 3, 4)
  - [x] When `medication.complete` (dispensed) is called on the Hub:
    - Create a `MedicationStatement` with `status: active`, linking back to the source `MedicationRequest`.
    - If a MedicationStatement already exists for the same medication + patient, update the effective period.
  - [x] When a `MedicationRequest` is voided:
    - Update the corresponding `MedicationStatement` to `status: stopped`.
  - [x] Wire into `hub-api/src/trpc/routers/medication.ts` `complete` and voiding paths.

- [x] **Task 4: Local Cache & Encounter Load** (AC: 8, 9)
  - [x] Add `medicationStatements` table to opd-lite Dexie schema.
  - [x] On encounter start, fetch active MedicationStatements for the patient from Hub via `medicationStatement.listActive`.
  - [x] Cache locally in Dexie for offline access during the encounter.
  - [x] If fetch fails (offline), use cached data. If no cache exists, set `medicationHistoryAvailable: false`.
  - [x] Add `medicationHistoryAvailable` flag to `useEncounterStore`.

- [x] **Task 5: Expand Interaction Checker** (AC: 5, 6, 7, 9)
  - [x] Modify `interactionService.ts` to accept THREE sources:
    1. `pendingPrescriptions: string[]` (current encounter — existing)
    2. `activeMedications: MedicationStatement[]` (patient history — new)
    3. `activeAllergies: AllergyIntolerance[]` (from Story 10.2 — new)
  - [x] Extract medication names/codes from MedicationStatements.
  - [x] For code-based matching: compare `medicationCodeableConcept.coding[0].code` when available.
  - [x] For display-name matching: fall back to `medicationCodeableConcept.text` or `coding[0].display`.
  - [x] For allergy matching: compare medication substance against allergy substances (fuzzy match).
  - [x] When `medicationHistoryAvailable === false`: show inline warning banner "Full medication history unavailable — interaction check limited to current encounter". Do NOT default to "no interactions found."

- [x] **Task 6: Wire Into Encounter Dashboard** (AC: 5, 6)
  - [x] On encounter start, load active MedicationStatements and active allergies.
  - [x] Pass both to the interaction checker when a new prescription is added.
  - [x] Display "Checking against X active medications and Y known allergies" in the interaction results.

- [x] **Task 7: Tests** (AC: 10)
  - [x] Test: Warfarin (active MedicationStatement) + Aspirin (new prescription) → `CONTRAINDICATED` detected.
  - [x] Test: Penicillin allergy + Amoxicillin prescription → `ALLERGY_MATCH` detected.
  - [x] Test: Code-based matching finds interaction even when display names differ.
  - [x] Test: Display-name fallback works when no codes available.
  - [x] Test: "History unavailable" warning shown when MedicationStatements can't be loaded.
  - [x] Test: Interaction checker still works with only pending prescriptions (backward compatible).
  - [x] Test: Dispensed prescription creates active MedicationStatement on Hub.
  - [x] Test: Voided prescription stops the MedicationStatement.

## Dev Notes

### The Warfarin-Aspirin Scenario

This is the canonical example of why this story matters:
1. Visit 1 (Monday): Dr. A prescribes warfarin for atrial fibrillation.
2. Visit 2 (Friday): Dr. B prescribes aspirin for headache.
3. Without MedicationStatement: No interaction warning. Patient gets both drugs. Risk of major bleeding.
4. With MedicationStatement: Warfarin is in the patient's active medication list. Aspirin triggers `CONTRAINDICATED` alert.

### MedicationStatement vs. MedicationRequest

| | MedicationRequest | MedicationStatement |
|---|---|---|
| **What** | A prescription (order) | A record of what the patient is actually taking |
| **When created** | Clinician writes a prescription | Prescription is dispensed (becomes "active taking") |
| **Lifecycle** | pending → active → completed/cancelled | active → completed/stopped |
| **Scope** | Single encounter | Cross-encounter (patient's full medication profile) |

### Drug Family Matching (Future)

The initial implementation uses direct name/code matching. A patient allergic to "Penicillin" won't trigger on "Amoxicillin" unless the allergy substance text contains "amoxicillin" or a fuzzy match catches it. True drug-class matching (beta-lactams, NSAIDs, sulfonamides) requires a drug classification hierarchy — this is a future enhancement when the licensed drug database (PRD OQ-02) is integrated.

### Tier 1 Sync for Active MedicationStatements

Active MedicationStatements are Tier 1 (safety-critical, append-only merge). The sync engine already handles this for `MedicationRequest` with status `active`. The same treatment applies to `MedicationStatement`. Ensure `conflict-tiers.ts` maps `MedicationStatement` to `TIER_1` for active status and `TIER_2` for completed/stopped.

### References

- CLAUDE.md Rule #3: Drug interaction checks must never be skipped silently
- PRD: Section 20.2 (interaction severity levels and override policies)
- PRD: Section 6.15 (Tier 1 — active medication list)
- FHIR R4: MedicationStatement (https://hl7.org/fhir/R4/medicationstatement.html)
- Story 3.2: Local Drug-Drug Interaction Checker (existing implementation being expanded)
- Story 10.2: Global Allergy Management (provides allergy data for ALLERGY_MATCH)
- Deferred items: D2 (3-2 review), W2 (3-3 review), D1 (4-2 review) — all resolved by this story

## Dev Agent Record

### Implementation Summary

All 7 tasks completed. Key files added/modified:

- `packages/shared-types/src/fhir/medication-statement.schema.ts` — FHIR R4 MedicationStatement Zod schema
- `apps/hub-api/src/trpc/routers/medication-statement.ts` — listActive, create, updateStatus endpoints
- `apps/hub-api/src/trpc/routers/medication.ts` — complete/void now creates/stops MedicationStatement
- `apps/opd-lite/src/lib/db.ts` — `medicationStatements` table added to Dexie schema
- `apps/opd-lite/src/services/interactionService.ts` — extended to accept activeMedications + activeAllergies
- `apps/opd-lite/src/stores/encounter-store.ts` — medicationHistoryAvailable flag; loads MedicationStatements on start
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — passes history to interaction checker
- `apps/opd-lite/src/__tests__/interaction-service.test.ts` — 23 tests (Dexie-backed vocabulary, safety invariants)
- `apps/opd-lite/src/__tests__/medication-statement-interaction.test.ts` — 15 tests (cross-encounter, allergy, code/display matching)

**Root cause fixed in db.ts:** `clinicalStatus.coding[0].code` was an invalid IDB key path in the `allergyIntolerances` index (bracket notation is rejected by fake-indexeddb's `validateKeyPath`). Dexie's `wrap()` swallowed the SyntaxError, leaving the schema incomplete, triggering a schema-patch version-bump cycle that caused VersionErrors across test files. Fixed by removing the invalid index.

### Test Results (opd-lite full suite)

**Before this story:** 27 failed | 454 passed (9 failed files)
**After this story:** 0 failed | 532 passed (51 files)

Story-specific tests pass: `interaction-service.test.ts` 23/23, `medication-statement-interaction.test.ts` 15/15.

### Previously Failing Tests (fixed)

1. **`src/__tests__/dexie-audit-adapter.test.ts > DexieAuditAdapter > only fetches pending events, not synced or failed`**
   - Root cause: Test used raw `db.clientAuditLog.update()` which doesn't properly update compound indexes in fake-indexeddb. Fixed by using the adapter's own `markSynced`/`markFailed` methods which use `.modify()`.

2. **`src/__tests__/vitals-store.test.ts > useVitalsStore > sets autosaveStatus to saved on success`**
   - Root cause: Cross-test contamination from shared fake-indexeddb singleton. Fixed by adding defensive `db.open()` check and `syncQueue.clear()` in `beforeEach` to handle stale DB state from prior test files.

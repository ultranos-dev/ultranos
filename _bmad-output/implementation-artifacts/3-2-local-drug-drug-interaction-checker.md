# Story 3.2: Local Drug-Drug Interaction Checker

Status: ready-for-dev

## Story

As a clinician,
I want to be warned of potential drug interactions offline,
so that I can ensure patient safety even when disconnected from the Hub.

## Acceptance Criteria

1. [ ] A high-severity alert is displayed if a new prescription interacts with the patient's "Active" medications.
2. [ ] Interaction logic uses a local interaction matrix (Top 500 drug interactions).
3. [ ] Clinicians can view the severity and a brief description of the interaction.
4. [ ] The system allows the clinician to "Override" the warning with a mandatory justification.
5. [ ] The interaction check executes in <200ms upon adding a medication to the list.

## Tasks / Subtasks

- [ ] **Task 1: Interaction Matrix Integration** (AC: 2)
  - [ ] Bundle a JSON interaction matrix (Drug A + Drug B = Severity) in `apps/opd-lite-pwa`.
  - [ ] Create an `InteractionChecker` service to query this matrix.
- [ ] **Task 2: Safety Gate Logic** (AC: 1, 5)
  - [ ] Implement a `checkInteractions` hook in the `PrescriptionEntry` flow.
  - [ ] Logic: Compare the `newMedication` ID against all IDs in the patient's `MedicationStatement` (Active meds) and current `MedicationRequest` list.
- [ ] **Task 3: Warning & Override UI** (AC: 1, 3, 4)
  - [ ] Build a high-contrast modal for "Contraindication Detected".
  - [ ] Display the severity (e.g., SEVERE, MODERATE).
  - [ ] Require a text justification if the clinician chooses to "Proceed Anyway".
- [ ] **Task 4: Audit Logging**
  - [ ] Log the interaction check result (Pass/Blocked/Overridden) to the local ledger for compliance.

## Dev Notes

- **Offline-First:** This is a purely local check. Do not rely on external APIs (e.g., RxNav) at runtime.
- **Data Model:** Overrides must be stored in the `detectedIssue` field of the FHIR `MedicationRequest`.
- **Severity:** Only show modal for "High/Severe" interactions; use inline warnings for "Moderate".

### Project Structure Notes

- Service: `apps/opd-lite-pwa/src/services/interactionService.ts`
- Modal: `apps/opd-lite-pwa/src/components/modals/InteractionWarningModal.tsx`

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Medication-Safety)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR7)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

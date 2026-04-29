# Story 3.1: Medication Search & Prescription Entry

Status: ready-for-dev

## Story

As a clinician,
I want to search for and prescribe medications,
so that I can provide treatment to the patient that is documented in a FHIR-compliant format.

## Acceptance Criteria

1. [ ] A searchable formulary (Medication subset) is accessible offline.
2. [ ] Search results show Name, Dosage Form, and Strength.
3. [ ] Clinicians can enter Dosage, Frequency, and Duration for each selection.
4. [ ] Selection creates a FHIR `MedicationRequest` resource in the local store.
5. [ ] The medication is marked as "Pending Fulfillment" in the UI.

## Tasks / Subtasks

- [ ] **Task 1: Formulary Vocabulary Setup** (AC: 1, 2)
  - [ ] Pre-load a subset of common medications into the Dexie `vocabulary` store (linked to FHIR `Medication` resources).
  - [ ] Implement a `searchMedications` utility with fuzzy matching in `@ultranos/sync-engine` or local service.
- [ ] **Task 2: Prescription Entry UI** (AC: 2, 3)
  - [ ] Create `PrescriptionEntry` component in `apps/opd-lite-pwa`.
  - [ ] Implement autocomplete for medication search.
  - [ ] Build a sub-form for Dosage (quantity), Frequency (e.g., BID, TID), and Duration (days).
- [ ] **Task 3: MedicationRequest Mapping** (AC: 4, 5)
  - [ ] Integrate with `useEncounterStore` to manage a `pendingPrescriptions` array.
  - [ ] Map the form state to a FHIR `MedicationRequest` object (Zod validated).
  - [ ] Assign an HLC timestamp to the request.
- [ ] **Task 4: Persistence**
  - [ ] Save the `MedicationRequest` to the local Dexie store.
  - [ ] Link it to the active `Encounter` and `Patient` IDs.

## Dev Notes

- **Data Model:** Use `MedicationRequest` from `@ultranos/shared-types`.
- **Frequency:** Use standard clinical abbreviations (e.g., `QD`, `BID`, `TID`, `QID`) but store them as FHIR `Timing` objects.
- **Search:** Search should be instantaneous (<500ms) against the local indexed cache.

### Project Structure Notes

- Component: `apps/opd-lite-pwa/src/components/clinical/PrescriptionEntry.tsx`
- Vocabulary: `apps/opd-lite-pwa/src/assets/vocab/medications_subset.json`

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#E-Prescribing)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR6)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

# Story 4.2: Medication Fulfillment & Labeling

Status: done

## Story

As a pharmacist,
I want to confirm the medications I am dispensing and print instructions for the patient,
so that the patient receives the correct treatment and knows how to use it safely.

## Acceptance Criteria

1. [x] Pharmacist can select which medications from the prescription are being fulfilled (Partial vs. Full).
2. [x] For each medication, the pharmacist can confirm the Brand Name and Batch/Lot Number (Optional).
3. [x] A "Patient Label" view is generated with clear, low-literacy instructions (e.g., icons for Morning/Night).
4. [x] Fulfillment creates a FHIR `MedicationDispense` resource linked to the original `MedicationRequest`.
5. [x] UI supports RTL for patient instructions (Arabic/Dari).

## Tasks / Subtasks

- [x] **Task 1: Fulfillment Checklist UI** (AC: 1, 2)
  - [x] Build the `FulfillmentChecklist` component.
  - [x] Implement multi-select checkboxes for prescription items.
  - [x] Add input fields for specific Batch/Expiry data if required by local policy.
- [x] **Task 2: Patient Label Generation** (AC: 3, 5)
  - [x] Create a `MedicationLabel` component using `@ultranos/ui-kit`.
  - [x] Integrate visual icons for dosage timing (Sun, Moon, Food).
  - [x] Ensure labels are printable via standard browser print or thermal printer (CSS `@media print`).
- [x] **Task 3: MedicationDispense Mapping** (AC: 4)
  - [x] Map the fulfillment state to a FHIR `MedicationDispense` resource.
  - [x] Assign an HLC timestamp to the dispense event.
  - [x] Save to the local Dexie ledger.

### Review Findings

- [x] [Review][Defer] **D1: Drug interaction / allergy check before dispensing** — Deferred: pharmacy trusts prescriber-side checks (Epic 3). Full interaction checks require MedicationStatement data (not yet built). Consistent with 3-2 review D2.
- [x] [Review][Patch] **D2: Add local fulfillment tracking in `_ultranos`** — Added `fulfilledCount`/`totalCount` optional fields to MedicationDispense._ultranos. ✅ Fixed
- [x] [Review][Patch] **D3: Add patient name + age to FulfillmentChecklist** — Added `patientName`/`patientAge` to store and header display. ✅ Fixed
- [x] [Review][Patch] **P1: No audit logging on MedicationDispense creation** — Created `dispenseAuditService.ts` with `logDispenseEvent()` + Dexie `dispenseAuditLog` table (v10). ✅ Fixed
- [x] [Review][Patch] **P2: HLC module-level instantiation with SSR crash risk** — Replaced custom HLC with shared singleton from `@/lib/hlc`. ✅ Fixed
- [x] [Review][Patch] **P3: Print CSS stacks multiple labels at same absolute position** — Changed to `position: relative` with `page-break-after: always`. ✅ Fixed
- [x] [Review][Patch] **P4: Missing RTL snapshot tests for both components** — Added LTR/RTL snapshot tests for both FulfillmentChecklist and MedicationLabel. ✅ Fixed
- [x] [Review][Patch] **P5: Label timing text not localized** — Added `TIMING_LABELS` map (en/ar/fa) with `locale` prop on MedicationLabel. ✅ Fixed
- [x] [Review][Patch] **P6: No versionId in MedicationDispense meta** — Added `versionId: '1'` to meta. ✅ Fixed
- [x] [Review][Patch] **P7: isOfflineCreated hardcoded to true** — Now checks `navigator.onLine`. ✅ Fixed
- [x] [Review][Defer] **W1: No duplicate-dispensing guard** — Same prescription can be dispensed multiple times with no idempotency check. Needs design discussion beyond this story scope. [medication-dispense.ts:47]
- [x] [Review][Defer] **W2: Dexie schema version repetition risk** — Each version() call repeats all stores; omitting one in future versions silently deletes data. Pre-existing pattern (D33). [db.ts]
- [x] [Review][Defer] **W3: startReview phase transition unused in UI** — fulfillment-store defines startReview() but FulfillmentChecklist never calls it or checks for 'reviewing' phase. [fulfillment-store.ts:90]
- [x] [Review][Defer] **W4: scannedAt uses Date.now instead of HLC** — Pre-existing pattern (D62). [fulfillment-store.ts:53]
- [x] [Review][Defer] **W5: whenHandedOver / meta.lastUpdated use wall-clock time** — FHIR-facing timestamps use Date.now, not HLC. Pre-existing pattern (P6/D62). [medication-dispense.ts:52,93]
- [x] [Review][Defer] **W6: dir="auto" may produce inconsistent LTR/RTL layout** — Container direction determined by first strong character. Latin medication names force LTR in RTL interface. Design decision. [FulfillmentChecklist.tsx:30, MedicationLabel.tsx:93]

## Dev Notes

- **Partial Fulfillment:** Allow pharmacists to fulfill 1 of 2 medications if one is out of stock. The `MedicationRequest` status should remain `active` until all items are fulfilled.
- **UX:** Use the "Primary Green Pill" button for the final "Confirm Dispensing" action.

### Project Structure Notes

- Component: `apps/opd-lite-pwa/src/components/pharmacy/FulfillmentChecklist.tsx`
- Component: `apps/opd-lite-pwa/src/components/pharmacy/MedicationLabel.tsx`

### References

- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR11)
- UX Specs: [ux-design-specification.md](../planning-artifacts/ux-design-specification.md#Button)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- **Task 1:** Built `FulfillmentChecklist` component with multi-select checkboxes for partial/full fulfillment. Extended `fulfillment-store` with `brandName`, `batchLot`, `setBrandName()`, `setBatchLot()`. Brand/batch inputs conditionally render only for selected items. "Primary Green Pill" confirm button per UX spec. 15 tests.
- **Task 2:** Built `MedicationLabel` component with visual dosage timing icons (Sun=morning, Food=noon, Moon=night) based on frequency. RTL support via `dir="auto"` with override prop. CSS `@media print` rules for thermal/standard printing. 14 tests.
- **Task 3:** Created `createMedicationDispense()` mapper producing FHIR R4 MedicationDispense resources linked to original MedicationRequest via `authorizingPrescription`. HLC timestamps via `@ultranos/sync-engine`. Added Dexie v9 schema with `dispenses` table indexed on `subject.reference` and `_ultranos.hlcTimestamp`. 16 tests.
- **Full regression:** 42 test files, 462 tests — all passing, zero regressions.

### Change Log

- 2026-04-29: Implemented Story 4.2 — FulfillmentChecklist, MedicationLabel, MedicationDispense mapping with Dexie persistence.

### File List

- `apps/opd-lite-pwa/src/components/pharmacy/FulfillmentChecklist.tsx` (new)
- `apps/opd-lite-pwa/src/components/pharmacy/MedicationLabel.tsx` (new)
- `apps/opd-lite-pwa/src/lib/medication-dispense.ts` (new)
- `apps/opd-lite-pwa/src/stores/fulfillment-store.ts` (modified — added brandName, batchLot, setBrandName, setBatchLot)
- `apps/opd-lite-pwa/src/lib/db.ts` (modified — added dispenses table v9)
- `apps/opd-lite-pwa/src/app/globals.css` (modified — added @media print rules)
- `apps/opd-lite-pwa/src/__tests__/FulfillmentChecklist.test.tsx` (new — 15 tests)
- `apps/opd-lite-pwa/src/__tests__/MedicationLabel.test.tsx` (new — 14 tests)
- `apps/opd-lite-pwa/src/__tests__/medication-dispense.test.ts` (new — 16 tests)

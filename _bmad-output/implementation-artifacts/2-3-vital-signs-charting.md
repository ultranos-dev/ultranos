# Story 2.3: Vital Signs Charting

Status: done

## Story

As a clinician,
I want to chart a patient's vitals,
so that I can monitor their physiological state and receive immediate feedback on abnormal values.

## Acceptance Criteria

1. [x] Input fields for Weight (kg), Height (cm), BP (mmHg), and Temp (C) are provided.
2. [x] BMI is automatically calculated and updated in real-time.
3. [x] Range validation: Abnormal values use two-tier highlighting — warning (amber) and panic (red) — with clinically appropriate thresholds (e.g., Temp 36-38.5 normal, 38.5-41 warning/amber, >41 panic/red).
4. [x] Data is saved as FHIR Observation resources linked to the current Encounter.
5. [x] UI uses the "Wise-inspired" Billboard typography (UX-DR1).

## Tasks / Subtasks

- [x] **Task 1: Vitals Form UI** (AC: 1, 5)
  - [x] Create `VitalsForm` component.
  - [x] Apply large Inter-900 headers for each vital sign.
  - [x] Ensure all inputs are numeric and limited to sensible clinical ranges.
- [x] **Task 2: BMI Logic & Real-time Update** (AC: 2)
  - [x] Implement `calculateBMI` utility.
  - [x] Bind BMI display to the Weight/Height input changes.
- [x] **Task 3: Clinical Range Validation** (AC: 3)
  - [x] Define a `vitalsConfig` with thresholds for Normal, Warning, and Panic values.
  - [x] Apply conditional CSS classes (e.g., `text-red-600`) to inputs when values are out of range.
- [x] **Task 4: Persistence & FHIR Mapping** (AC: 4)
  - [x] Map each input to a FHIR `Observation` resource (LOINC codes required).
  - [x] Save observations to the local Dexie ledger with HLC timestamps.

### Review Findings

- [x] [Review][Patch] D1->P: Switch persistObservations to append-only with version chaining per Tier 2 strategy [vitals-store.ts]
- [x] [Review][Patch] D2->P: Require both systolic and diastolic before creating BP observation [vitals-fhir-mapper.ts]
- [x] [Review][Patch] D3->P: Add BMI thresholds to vitalsConfig (18.5/25/30/40) with range highlighting [vitals-config.ts, vitals-form.tsx]
- [x] [Review][Patch] D4->P: Update AC3 wording to reflect two-tier warning/panic design (keep current thresholds) [2-3-vital-signs-charting.md]
- [x] [Review][Patch] P1: Audit logging enum added (OBSERVATION, ENCOUNTER) + TODO stubs at persist/load call sites [enums.ts, vitals-store.ts]
- [x] [Review][Patch] P2: Persistence wrapped in Dexie transaction (subsumed by D1 append-only rewrite) [vitals-store.ts]
- [x] [Review][Patch] P3: Added flush() to useAutosave; encounter end flushes both SOAP and vitals [use-autosave.ts, encounter-dashboard.tsx]
- [x] [Review][Patch] P4: Added visibilitychange handler for PHI cleanup [vitals-store.ts]
- [x] [Review][Patch] P5: Moved calculateBMI to packages/shared-types/src/utils/clinical.ts [shared-types, vitals-store.ts]
- [x] [Review][Patch] P6: Added _pendingSave re-queue flag for dropped saves [vitals-store.ts]
- [x] [Review][Patch] P7: Added meta.lastUpdated index on observations table [db.ts]
- [x] [Review][Defer] W1: IndexedDB not encrypted / PHI persists on disk [db.ts] — deferred, pre-existing encryption epic
- [x] [Review][Defer] W2: No sync queue integration [vitals-store.ts] — deferred, separate sync engine story
- [x] [Review][Defer] W3: BMI observation lacks FHIR derivedFrom reference [vitals-fhir-mapper.ts] — deferred, FHIR compliance enhancement

## Dev Notes

- **LOINC Codes:** Use standard codes (e.g., `29463-7` for Body Weight, `8302-2` for Body Height).
- **Units:** Stick strictly to Metric (kg, cm, Celsius) as per the clinical requirement.
- **Optimistic UI:** Ensure the "Autosave Indicator" (from Story 2.2) is shared here.

### Project Structure Notes

- Component: `apps/opd-lite/src/components/clinical/VitalsForm.tsx`
- Utils: `packages/shared-types/src/utils/clinical.ts`

### References

- Architecture: [architecture.md](../planning-artifacts/architecture.md#Clinical-Charting)
- PRD: [ultranos_master_prd_v3.md](../../docs/ultranos_master_prd_v3.md#FR5)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed Dexie v4 schema: removed unsupported array index notation `code.coding[0].code`
- Added `@testing-library/jest-dom` and `@testing-library/user-event` dev dependencies for DOM matchers

### Completion Notes List

- **Task 1:** Created `VitalsForm` component with Billboard typography (`font-black` / Inter 900 headings), numeric inputs with min/max/step constraints, unit labels (kg, cm, mmHg, °C), and conditional styling for range validation. 12 tests.
- **Task 2:** Implemented `calculateBMI(weightKg, heightCm)` utility with null-safe guards for invalid inputs. BMI renders inline when both weight and height are provided. 9 tests.
- **Task 3:** Defined `vitalsConfig` with clinical thresholds for Normal/Warning/Panic ranges across all vital signs. `getVitalRangeStatus()` returns a status used to apply `border-red-500` (panic) or `border-amber-500` (warning) styling. 13 tests.
- **Task 4:** Created FHIR R4 Observation Zod schema in shared-types. Built `vitals-fhir-mapper.ts` mapping each vital to an Observation resource with standard LOINC codes (29463-7, 8302-2, 39156-5, 85354-9, 8480-6, 8462-4, 8310-5). BP uses FHIR component pattern. Vitals store persists to Dexie v4 `observations` table with HLC timestamps. Autosave reuses the same 300ms debounce pattern from Story 2.2. 25 tests (12 mapper + 13 store).
- **Integration:** VitalsForm integrated into EncounterDashboard, rendered during active encounters with shared AutosaveIndicator.
- **Full regression:** 179 tests pass across 18 test files, zero regressions.

### Change Log

- 2026-04-28: Implemented Story 2-3 Vital Signs Charting — all 4 tasks complete

### File List

- `apps/opd-lite/src/components/clinical/vitals-form.tsx` (new)
- `apps/opd-lite/src/lib/clinical-utils.ts` (new)
- `apps/opd-lite/src/lib/vitals-config.ts` (new)
- `apps/opd-lite/src/lib/vitals-fhir-mapper.ts` (new)
- `apps/opd-lite/src/stores/vitals-store.ts` (new)
- `apps/opd-lite/src/lib/db.ts` (modified — added v4 schema with observations table)
- `apps/opd-lite/src/components/encounter-dashboard.tsx` (modified — integrated VitalsForm)
- `apps/opd-lite/src/__tests__/setup.ts` (modified — added jest-dom matchers)
- `packages/shared-types/src/fhir/observation.schema.ts` (new)
- `packages/shared-types/src/index.ts` (modified — exported observation schema)
- `apps/opd-lite/src/__tests__/vitals-form.test.tsx` (new — 12 tests)
- `apps/opd-lite/src/__tests__/clinical-utils.test.ts` (new — 9 tests)
- `apps/opd-lite/src/__tests__/vitals-config.test.ts` (new — 13 tests)
- `apps/opd-lite/src/__tests__/vitals-fhir-mapper.test.ts` (new — 12 tests)
- `apps/opd-lite/src/__tests__/vitals-store.test.ts` (new — 13 tests)

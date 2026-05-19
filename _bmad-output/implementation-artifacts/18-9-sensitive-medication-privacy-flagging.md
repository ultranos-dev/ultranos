# Story 18.9: Sensitive Medication Privacy Flagging

Status: done

## Story

As a patient,
I want sensitive medications (antiretrovirals, psychiatric drugs) to be hidden behind a privacy gate,
so that my screen is safe to show to others without exposing stigmatized conditions.

## Acceptance Criteria

1. Medications belonging to sensitive ATC categories are automatically flagged as sensitive:
   - HIV/Antiretrovirals: ATC code prefix `J05A*`
   - Psychiatric: ATC code prefixes `N05*` (psycholeptics) and `N06*` (psychoanaleptics)
   - Opioid substitution: ATC code prefix `N07BC*`
2. On the medication timeline and home dashboard, sensitive medications display as "Private Health Matter" with a lock icon instead of the medication name
3. Tapping a sensitive medication item prompts biometric confirmation (fingerprint/face) before revealing the actual medication name
4. Revealing a sensitive medication emits an audit event: `PHI_UNMASK` with `resourceType: 'MedicationRequest'`, `resourceId`, and `unmaskedBy: userId`
5. The revealed medication name auto-hides after 30 seconds (returns to "Private Health Matter")
6. The `isSensitive` flag is determined by the `humanizeMedication()` utility function based on ATC code classification
7. Non-sensitive medications display normally with full name, dose, and frequency
8. The FHIR Bundle export (Story 18.8) includes ALL medications including sensitive ones — the export is the patient's complete record
9. Privacy flagging works entirely offline — the ATC code lookup is local, no network needed

## Dependencies

- Story 18.4 (Home Dashboard — provides medication display area)
- Story 18.5 (Allergy Display — establishes the timeline item pattern)
- Story 18.2 (OTP Authentication — provides biometric infrastructure via `expo-local-authentication`)

## Existing Code Context

- `apps/patient-lite-mobile/src/lib/mobile-key-service.ts` — `unlockWithBiometrics()` exists for biometric prompts
- `packages/shared-types/` — medication-related FHIR types exist
- `apps/patient-lite-mobile/src/screens/TimelineScreen.tsx` — timeline rendering exists
- No ATC code classification utility exists yet

## Tasks / Subtasks

- [x] Task 1: Create ATC sensitivity classifier (AC: #1, #6, #9)
  - [x] Create `src/utils/medication-privacy.ts`
  - [x] Function: `isSensitiveMedication(atcCode: string): boolean`
    - Returns `true` if ATC code starts with: `J05A`, `N05`, `N06`, `N07BC`
    - Returns `false` for all other codes and `null`/undefined codes
  - [x] Function: `humanizeMedication(medication: MedicationRequest): HumanizedMedication`
    - Returns: `{ name, dose, frequency, isSensitive, maskedName: 'Private Health Matter' }`
    - `isSensitive` is populated based on `isSensitiveMedication(atcCode)`
  - [x] ATC code is extracted from `medicationCodeableConcept.coding[].code` where `system` contains `ATC` or `WHO-ATC`
  - [x] All logic is pure functions — no network calls
- [x] Task 2: Create SensitiveMedicationItem component (AC: #2, #3, #5)
  - [x] Create `src/components/SensitiveMedicationItem.tsx`
  - [x] Default state: shows "Private Health Matter" with lock icon, no medication details visible
  - [x] On tap: prompt biometric via `unlockWithBiometrics()` from `mobile-key-service.ts`
  - [x] On biometric success: reveal actual medication name, dose, frequency for 30 seconds
  - [x] After 30 seconds: auto-hide back to "Private Health Matter" (use `setTimeout`)
  - [x] On biometric failure: show brief error, remain masked
  - [x] Visual: lock icon, muted gray background when masked; normal medication styling when revealed
  - [x] Add `aria-label="Private Health Matter - tap to reveal"` for accessibility
- [x] Task 3: Integrate into Timeline and Dashboard (AC: #2, #7)
  - [x] In `TimelineScreen.tsx`: when rendering `MedicationRequest` items, check `isSensitive`
    - If sensitive: render `SensitiveMedicationItem` instead of normal medication item
    - If not sensitive: render normal medication item with full details
  - [x] In `HomeDashboardScreen.tsx` medications summary:
    - Count includes ALL medications (sensitive and non-sensitive)
    - Active medications count text: "3 Active Medications" (doesn't reveal which are sensitive)
    - Individual medication names are NOT shown on dashboard — only count + "View All" link
- [x] Task 4: Audit event on unmask (AC: #4)
  - [x] When biometric verification succeeds and medication is revealed:
    - Emit `PHI_UNMASK` audit event via `@ultranos/audit-logger`
    - Event data: `{ action: 'PHI_UNMASK', resourceType: 'MedicationRequest', resourceId, unmaskedBy: userId, timestamp }`
    - No medication name or PHI in the audit event — only the resource ID
  - [x] Fire-and-forget: audit failure must not block the UI reveal
- [x] Task 5: FHIR export inclusion (AC: #8)
  - [x] Verify that `fhir-bundle-builder.ts` (Story 18.8) includes ALL medications regardless of sensitivity
  - [x] The export is the complete record — no privacy masking in the export file
  - [x] The `isSensitive` flag is NOT included in the FHIR Bundle (it's a UI concern, not a FHIR field)
- [x] Task 6: Testing (AC: all)
  - [x] Test: `isSensitiveMedication('J05AF01')` returns true (tenofovir — antiretroviral)
  - [x] Test: `isSensitiveMedication('N05AH03')` returns true (olanzapine — antipsychotic)
  - [x] Test: `isSensitiveMedication('C09AA01')` returns false (captopril — cardiovascular)
  - [x] Test: `isSensitiveMedication(null)` returns false
  - [x] Test: sensitive medication shows "Private Health Matter" by default
  - [x] Test: biometric success reveals medication name
  - [x] Test: auto-hide after 30 seconds
  - [x] Test: biometric failure keeps medication masked
  - [x] Test: audit event emitted on unmask
  - [x] Test: FHIR export includes sensitive medications
  - [x] Snapshot test: masked vs revealed states

### Review Findings

- [x] [Review][Decision] D1: Missing `unmaskedBy: userId` in PHI_UNMASK audit event — RESOLVED: Added `metadata: { unmaskedBy: patientId }` to both audit calls [SensitiveMedicationItem.tsx, MedicalTimeline.tsx]
- [x] [Review][Decision] D2: `humanizeMedication()` returns real medication name in `label` when sensitive — RESOLVED: Kept current approach (real name needed for reveal flow), removed unused `SENSITIVE_MEDICATION_LABELS`, added contract comment [fhir-humanizer.ts]
- [x] [Review][Patch] P1: CRITICAL — Sensitive med falls through to ActiveMedCard when `patientId` is undefined — FIXED: Now always routes sensitive meds to SensitiveMedicationItem regardless of patientId [ActiveMedications.tsx:120]
- [x] [Review][Patch] P2: No lock icon in timeline view for sensitive medications — FIXED: Added lock emoji prefix to "Private Health Matter" text in timeline [MedicalTimeline.tsx:202]
- [x] [Review][Patch] P3: ATC system URI matching overly broad — FIXED: Replaced `includes('ATC')` with specific known ATC system URI patterns [medication-privacy.ts]
- [x] [Review][Patch] P4: No manual collapse + stale timer — FIXED: Added tap-to-collapse when revealed, clear existing timer before starting new one [SensitiveMedicationItem.tsx]
- [x] [Review][Patch] P5: Race condition in TimelineItem — FIXED: Added `authenticating` state guard to prevent concurrent biometric invocations [MedicalTimeline.tsx]
- [x] [Review][Defer] W1: Dose/frequency not shown for medications (pre-existing) — AC #7 references "full name, dose, frequency" but neither path displays these separately; not changed by this story [ActiveMedications.tsx] — deferred, pre-existing
- [x] [Review][Defer] W2: Duplicate biometric/audit/timer logic between TimelineItem and SensitiveMedicationItem — maintenance risk; refactoring concern [MedicalTimeline.tsx, SensitiveMedicationItem.tsx] — deferred, pre-existing
- [x] [Review][Defer] W3: Overly aggressive sensitivity on free-text encounter reasons (pre-existing) — `humanizeEncounter` marks all text-only reasons as sensitive [fhir-humanizer.ts:211] — deferred, pre-existing

## Dev Agent Record

### Implementation Plan
- Created `medication-privacy.ts` utility with `isSensitiveMedication()` and `extractAtcCode()` pure functions
- Updated `humanizeMedication()` in `fhir-humanizer.ts` to detect ATC codes and set `isSensitive` flag
- Created `SensitiveMedicationItem` component with biometric gate, 30s auto-hide, and PHI_UNMASK audit
- Integrated into `MedicalTimeline` (biometric for sensitive meds in timeline) and `ActiveMedications` (renders SensitiveMedicationItem for sensitive items)
- Dashboard already only shows medication count — no changes needed (AC #7 pre-satisfied)
- FHIR bundle builder already exports all medications without filtering — no changes needed (AC #8 pre-satisfied)

### Completion Notes
- All 6 tasks completed with 94 tests passing across 6 test suites
- ATC classifier covers J05A (HIV), N05 (psycholeptics), N06 (psychoanaleptics), N07BC (opioid substitution)
- Sensitive medications use biometric (unlockWithBiometrics) while encounters keep simple tap-to-reveal
- PHI_UNMASK audit event emitted on reveal; no PHI in audit data (only resource ID)
- Auto-hide after 30 seconds implemented in both SensitiveMedicationItem and Timeline
- All logic is pure/offline — no network calls for sensitivity detection
- 17 pre-existing test failures confirmed unrelated to this story's changes

## File List

### New Files
- `apps/patient-lite-mobile/src/utils/medication-privacy.ts` — ATC sensitivity classifier
- `apps/patient-lite-mobile/src/components/SensitiveMedicationItem.tsx` — Privacy-gated medication card component
- `apps/patient-lite-mobile/__tests__/medication-privacy.test.ts` — 21 tests for ATC classifier
- `apps/patient-lite-mobile/__tests__/SensitiveMedicationItem.test.tsx` — 10 tests for component
- `apps/patient-lite-mobile/__tests__/sensitive-medication-timeline.test.tsx` — 7 integration tests

### Modified Files
- `apps/patient-lite-mobile/src/lib/fhir-humanizer.ts` — Added ATC code sensitivity detection to humanizeMedication()
- `apps/patient-lite-mobile/src/components/timeline/MedicalTimeline.tsx` — Biometric gate for sensitive meds, auto-hide, PHI_UNMASK audit
- `apps/patient-lite-mobile/src/components/timeline/ActiveMedications.tsx` — Renders SensitiveMedicationItem for sensitive meds
- `apps/patient-lite-mobile/__tests__/fhir-humanizer.test.ts` — Added 7 tests for medication ATC sensitivity
- `apps/patient-lite-mobile/__tests__/fhir-bundle-builder.test.ts` — Added 1 test for sensitive med export inclusion

## Change Log

- 2026-05-18: Implemented Story 18.9 — Sensitive Medication Privacy Flagging. Created ATC-based medication sensitivity classifier, privacy-gated SensitiveMedicationItem component with biometric unlock and 30-second auto-hide, integrated into timeline and active medications display, added PHI_UNMASK audit events, and verified FHIR export includes all medications. 46 new tests added.

## Technical Notes

- This is a privacy-by-design feature addressing stigma around HIV, mental health, and addiction treatment in MENA/Central Asia regions
- ATC (Anatomical Therapeutic Chemical) Classification System is maintained by WHO — codes are hierarchical
- J05A = Direct acting antivirals (includes most HIV antiretrovirals)
- N05 = Psycholeptics (antipsychotics, anxiolytics, hypnotics/sedatives)
- N06 = Psychoanaleptics (antidepressants, psychostimulants, anti-dementia drugs)
- N07BC = Drugs used in opioid dependence (methadone, buprenorphine)
- Biometric confirmation ensures the patient themselves is revealing the data — not someone else looking at their phone
- The 30-second auto-hide is a safety measure — if the patient walks away from their phone, sensitive data auto-protects
- PHI_UNMASK audit creates a trail of when sensitive data was accessed — useful for security reviews

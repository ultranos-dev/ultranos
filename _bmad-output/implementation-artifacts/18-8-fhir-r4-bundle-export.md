# Story 18.8: FHIR R4 Bundle Export

Status: done

## Story

As a patient,
I want to export my complete medical record as a FHIR R4 Bundle,
so that I can share my data with other healthcare providers or keep my own copy.

## Acceptance Criteria

1. A "Export My Records" button is available on the Profile/Settings screen
2. On tap, a FHIR R4 Bundle (type `collection`) is generated containing all patient resources:
   - `Patient` resource (demographics)
   - All `Encounter` resources
   - All `MedicationRequest` resources (prescriptions)
   - All `MedicationStatement` resources (medication history)
   - All `AllergyIntolerance` resources
   - All `Observation` resources (vitals)
   - All `Condition` resources (diagnoses)
   - All `Consent` resources
3. The bundle is valid FHIR R4 JSON — `resourceType: 'Bundle'`, `type: 'collection'`, with `entry[]` array
4. Each entry includes `fullUrl` (URN-based) and `resource` (the FHIR resource object)
5. The bundle is offered via the device's share sheet (`expo-sharing`) — patient can save to Files, email, AirDrop, etc.
6. The export operation is logged as an audit event: `PATIENT_DATA_EXPORT` with patientId and resource count (no PHI in event)
7. A loading indicator is shown during generation with progress ("Preparing 42 records...")
8. The export file is named `ultranos-health-record-{date}.json`
9. PHI is included in the bundle (it IS the patient's data) — but the export file is NOT stored persistently on device after sharing
10. The bundle includes a `meta.lastUpdated` timestamp and `meta.tag` with `system: 'ultranos'` and `code: 'patient-export'`

## Dependencies

- Story 18.4 (Home Dashboard — provides the Profile/Settings area where the export button lives)
- Story 18.5 (Allergy Display — provides allergy data access layer)

## Existing Code Context

- `packages/shared-types/src/fhir/` — FHIR R4 type definitions for all resource types
- `apps/patient-lite-mobile/src/lib/encrypted-db.ts` — SQLCipher DB with `patient_profiles`, `medical_history`, `consents` tables
- `apps/patient-lite-mobile/src/data/allergy-queries.ts` — allergy data access (from Story 18.5)

## Tasks / Subtasks

- [x] Task 1: Create FHIR Bundle builder (AC: #2, #3, #4, #10)
  - [x] Create `src/data/fhir-bundle-builder.ts`
  - [x] Function: `buildPatientBundle(db): Promise<Bundle>` that:
    - Reads `patient_profiles` → builds `Patient` resource
    - Reads `medical_history` WHERE type = `Encounter` → builds `Encounter` resources
    - Reads `medical_history` WHERE type = `MedicationRequest` → builds `MedicationRequest` resources
    - Reads `medical_history` WHERE type = `MedicationStatement` → builds `MedicationStatement` resources
    - Reads `medical_history` WHERE type = `AllergyIntolerance` → builds `AllergyIntolerance` resources
    - Reads `medical_history` WHERE type = `Observation` → builds `Observation` resources
    - Reads `medical_history` WHERE type = `Condition` → builds `Condition` resources
    - Reads `consents` → builds `Consent` resources
  - [x] Wrap in `Bundle` structure: `{ resourceType: 'Bundle', type: 'collection', timestamp, meta, entry[] }`
  - [x] Each entry: `{ fullUrl: 'urn:uuid:{id}', resource: {...} }`
  - [x] Add `meta`: `{ lastUpdated: new Date().toISOString(), tag: [{ system: 'ultranos', code: 'patient-export' }] }`
- [x] Task 2: Export UI (AC: #1, #7, #8)
  - [x] Add "Export My Records" button to the Profile/Settings section on HomeDashboardScreen or a dedicated settings screen
  - [x] Button: document icon + "Export My Records" label (translated)
  - [x] On tap: show loading overlay with progress text ("Preparing X records...")
  - [x] Update progress as each resource type is collected
  - [x] On completion: trigger share sheet
- [x] Task 3: File sharing (AC: #5, #8, #9)
  - [x] Use `expo-file-system` to write the JSON bundle to a temporary cache directory
  - [x] Filename: `ultranos-health-record-{YYYY-MM-DD}.json`
  - [x] Use `expo-sharing` to open the device share sheet with the file
  - [x] After sharing dialog is dismissed: delete the temporary file (no persistent storage of the export)
  - [x] If sharing is unavailable (simulator, restricted device): fall back to clipboard copy of the JSON
- [x] Task 4: Audit logging (AC: #6)
  - [x] After successful bundle generation (before sharing):
    - Emit `PATIENT_DATA_EXPORT` audit event
    - Include: patientId, resourceCount (total entries), resourceTypes (list of types included)
    - No PHI in the audit event — just counts and types
  - [x] Use `@ultranos/audit-logger`
- [x] Task 5: FHIR validation (AC: #3)
  - [x] Ensure all resource types conform to FHIR R4 spec:
    - `Patient`: `name`, `birthDate`, `gender`, `identifier`
    - `AllergyIntolerance`: `code`, `clinicalStatus`, `verificationStatus`, `patient`
    - `MedicationRequest`: `medicationCodeableConcept`, `subject`, `status`, `intent`
    - `Encounter`: `class`, `status`, `subject`, `period`
    - `Observation`: `code`, `value`, `effectiveDateTime`, `subject`
    - `Condition`: `code`, `clinicalStatus`, `subject`
    - `Consent`: `status`, `scope`, `category`, `patient`
  - [x] Use FHIR type definitions from `@ultranos/shared-types` for type safety
  - [x] Write tests that validate the output bundle structure against FHIR R4 expectations
- [x] Task 6: Testing (AC: all)
  - [x] Test: bundle builder produces valid FHIR R4 Bundle structure
  - [x] Test: all resource types are included in output
  - [x] Test: empty database produces a bundle with only the Patient resource
  - [x] Test: export button shows loading state
  - [x] Test: share sheet is invoked with correct filename
  - [x] Test: temporary file is cleaned up after sharing
  - [x] Test: audit event is emitted with correct counts
  - [x] Test: bundle includes meta tags

### Review Findings

- [x] [Review][Decision] **D1: Audit event logs `success` before share completes** — Fixed: moved audit to after share/clipboard completes
- [x] [Review][Decision] **D2: Empty bundle silently exports** — Fixed: added empty bundle guard with alert
- [x] [Review][Patch] **P1: Stale `isExporting` closure — race condition on double-tap** — Fixed: replaced with useRef mutex
- [x] [Review][Patch] **P2: Deprecated `Clipboard` API — fallback is dead code** — Fixed: replaced with expo-clipboard
- [x] [Review][Patch] **P3: `cacheDirectory` can be null — produces invalid path** — Fixed: added null guard
- [x] [Review][Patch] **P4: Missing `fullUrl` fallback for consent and patient entries** — Fixed: added `?? row.id` / `?? patientRow.id` fallback
- [x] [Review][Patch] **P5: Unhandled `getEncryptedDbConnection()` failure in `handleExport`** — Fixed: added try/catch
- [x] [Review][Patch] **P6: Button text not translated — on i18n branch** — Fixed: added i18n keys for all 3 languages, wired useTranslation
- [x] [Review][Patch] **P7: No test for export failure audit event** — Fixed: added test case
- [x] [Review][Defer] **W1: Uses local `@/lib/audit` instead of `@ultranos/audit-logger`** — deferred, pre-existing pattern across patient-lite-mobile
- [x] [Review][Defer] **W2: Local audit logger lacks SHA-256 hash chaining** — deferred, pre-existing architectural gap
- [x] [Review][Defer] **W3: No `patient_id` filter on DB queries** — deferred, single-patient app by design
- [x] [Review][Defer] **W4: Unbounded queries / memory pressure** — deferred, unlikely for single patient
- [x] [Review][Defer] **W5: `parseJsonSafe` doesn't report skipped record count** — deferred, enhancement
- [x] [Review][Defer] **W6: Progress text shows per-type messages, not running count** — deferred, minor UX difference
- [x] [Review][Defer] **W7: Emoji instead of proper icon component** — deferred, style choice
- [x] [Review][Defer] **W8: `meta.tag.system` is bare string not URI** — deferred, FHIR conformance improvement

## Dev Agent Record

### Implementation Plan
- Created `fhir-bundle-builder.ts` that queries SQLCipher tables directly (patient_profiles, medical_history, consents)
- Created `useExportRecords` hook orchestrating bundle build → audit → file write → share → cleanup
- Added export button to ProfileScreen with loading overlay and progress text
- Added `PATIENT_DATA_EXPORT` audit action type
- Added `expo-sharing` dependency

### Completion Notes
- All 20 tests pass across 2 new test suites (fhir-bundle-builder.test.ts, export-records.test.tsx)
- ProfileScreen RTL snapshots updated to include the new export button
- Pre-existing test failures (login-screen, consent-sync, session-expiry, etc.) are unrelated to this story
- Bundle builder gracefully skips malformed JSON rows and mismatched resourceTypes
- Temp file written to `FileSystem.cacheDirectory` and deleted after sharing dialog dismissal
- Fallback to clipboard copy when expo-sharing is unavailable (simulator/restricted)

## File List

- `apps/patient-lite-mobile/src/data/fhir-bundle-builder.ts` — NEW: FHIR R4 Bundle builder
- `apps/patient-lite-mobile/src/hooks/useExportRecords.ts` — NEW: Export orchestration hook
- `apps/patient-lite-mobile/src/screens/ProfileScreen.tsx` — MODIFIED: Added export button UI
- `apps/patient-lite-mobile/src/lib/audit.ts` — MODIFIED: Added PATIENT_DATA_EXPORT action type
- `apps/patient-lite-mobile/package.json` — MODIFIED: Added expo-sharing dependency
- `apps/patient-lite-mobile/jest.setup.js` — MODIFIED: Added expo-sharing mock, expo-file-system additions
- `apps/patient-lite-mobile/__tests__/fhir-bundle-builder.test.ts` — NEW: Bundle builder unit tests
- `apps/patient-lite-mobile/__tests__/export-records.test.tsx` — NEW: Export UI integration tests
- `apps/patient-lite-mobile/__tests__/__snapshots__/ProfileScreen.test.tsx.snap` — MODIFIED: Updated snapshots
- `pnpm-lock.yaml` — MODIFIED: expo-sharing lockfile entry

## Change Log

- 2026-05-18: Implemented Story 18.8 — FHIR R4 Bundle export with share sheet, audit logging, and progress indicator

## Technical Notes

- PRD Section 5 (Data Rights): "Export as HL7 FHIR R4 Bundle (JSON) available at any time via Health Passport"
- The bundle is the patient's data — PHI inclusion is expected and correct for this feature
- The FHIR Bundle type is `collection` (not `document` or `searchset`) because it's a comprehensive export
- `expo-sharing` requires the file to exist on the filesystem — can't share from memory
- Large patient histories (100+ resources) may take a few seconds to serialize — hence the progress indicator
- The temp file should use `FileSystem.cacheDirectory` (auto-cleaned by OS) and manual deletion after share
- FHIR R4 Bundle spec: https://hl7.org/fhir/R4/bundle.html

# Story 43.4: Patient ID Verification Logging

Status: review

## Story

As a lab technician,
I want the system to log HOW patient identity was verified at sample collection,
So that there is a documented, auditable answer to "Did you verify this was the right patient?"

## Acceptance Criteria

1. **Given** a tech is about to collect a sample, **when** the tech verifies the patient's identity, **then** the system logs the verification method(s) used: National ID card (scanned), verbal confirmation of name + father's name, QR code from Health Passport, or other
2. **And** a minimum of two identifiers is required before sample collection can proceed
3. **And** if only one identifier is used, the system logs "Verification: INCOMPLETE — single identifier only" as a visible deviation record
4. **And** the verification log is part of the sample's chain of custody and audit trail

## Tasks / Subtasks

- [x] Task 1: Verification method enum and data model (AC: #1, #4)
  - [x] 1.1 Add `PatientVerificationMethod` enum to `packages/shared-types/src/enums.ts`:
    - `NATIONAL_ID_SCANNED` — physical National ID card scanned or number entered
    - `VERBAL_CONFIRMATION` — verbal confirmation of patient name + father's name
    - `QR_CODE` — QR code scanned from Health Passport (Patient-Lite app)
    - `WRISTBAND_SCANNED` — hospital wristband barcode (future, but include in enum)
    - `OTHER` — requires free-text description
  - [x] 1.2 Add `PATIENT_IDENTITY_VERIFIED` to `AuditAction` enum in `packages/shared-types/src/enums.ts`
  - [x] 1.3 Create `PatientVerificationRecord` interface in `packages/shared-types/src/fhir/diagnostic-report.schema.ts`:
    - `id: string` (UUID)
    - `sampleId: string` (reference to the sample from 42.3 accessioning)
    - `patientRef: string` (patient reference — opaque ID only)
    - `methods: PatientVerificationMethod[]` (array of methods used)
    - `otherDescription?: string` (required when `OTHER` is in methods array)
    - `verifiedBy: string` (practitioner ID of the verifying tech)
    - `verifiedAt: string` (ISO 8601 timestamp)
    - `hlcTimestamp: string`
    - `isComplete: boolean` (true if methods.length >= 2)
    - `deviationReason?: string` (populated when isComplete is false)
  - [x] 1.4 Add Dexie table `patientVerifications` to `apps/lab-lite/src/lib/db.ts`: `&id, sampleId, patientRef, verifiedAt`

- [x] Task 2: Verification UI component (AC: #1, #2, #3)
  - [x] 2.1 Create `apps/lab-lite/src/components/verification/PatientVerificationForm.tsx`
  - [x] 2.2 Checkbox list of verification methods: each method has a checkbox + optional detail input
    - `NATIONAL_ID_SCANNED`: checkbox + text input for ID number (last 4 digits only — data minimization)
    - `VERBAL_CONFIRMATION`: checkbox + confirmation prompt "Patient stated name and father's name?"
    - `QR_CODE`: checkbox (auto-checked if QR scan from existing PatientVerifyScanner was used)
    - `OTHER`: checkbox + mandatory text input for description
  - [x] 2.3 Two-identifier minimum enforcement: "Proceed" button disabled until >= 2 methods selected
  - [x] 2.4 If tech attempts to proceed with only 1 method, show warning banner: "Two-identifier verification is required. Proceeding with single identifier will be logged as an incomplete verification."
  - [x] 2.5 Allow tech to override with single identifier by checking "Override — single identifier" checkbox, which requires a deviation reason text input (minimum 10 characters)
  - [x] 2.6 Visual indicator showing verification completeness: green checkmark for >= 2 methods, yellow warning for single method with override
  - [x] 2.7 RTL support: logical CSS properties, form layout works in Arabic/Dari/Pashto

- [x] Task 3: Integration with sample accessioning (AC: #1, #4)
  - [x] 3.1 Insert verification step into the sample accessioning workflow from Story 42.3
  - [x] 3.2 Verification must occur BEFORE "Receive Sample" action completes
  - [x] 3.3 The `PatientVerificationRecord` is linked to the sample via `sampleId`
  - [x] 3.4 Sample detail view shows verification status badge: "2-ID Verified" (green) or "Incomplete Verification" (yellow)
  - [x] 3.5 If accessioning is done offline, verification record is stored in Dexie and synced with the sample

- [x] Task 4: Incomplete verification deviation logging (AC: #3)
  - [x] 4.1 When `isComplete === false`, create a deviation record stored alongside the verification
  - [x] 4.2 Deviation record visible in sample detail view with yellow highlight
  - [x] 4.3 Deviation record included in chain of custody timeline from Story 42.3
  - [x] 4.4 Incomplete verifications appear in a supervisor dashboard filter: "Samples with incomplete verification"

- [x] Task 5: Audit event emission (AC: #4)
  - [x] 5.1 Emit `PATIENT_IDENTITY_VERIFIED` audit event on verification completion
  - [x] 5.2 Audit metadata includes: `{ sampleId, methodsUsed: [...], isComplete, verifiedBy }` (no PHI — no patient name, no ID number)
  - [x] 5.3 If verification is incomplete, additional metadata: `{ deviationReason, overrideAcknowledged: true }`
  - [x] 5.4 Add `reportVerificationEvent()` helper to `apps/lab-lite/src/lib/audit-client.ts`
  - [x] 5.5 Verification audit event is part of the hash-chained audit trail from Story 43.1

- [x] Task 6: QR code auto-integration (AC: #1)
  - [x] 6.1 If patient was originally verified via QR scan (existing `PatientVerifyScanner.tsx`), auto-populate the `QR_CODE` method
  - [x] 6.2 Pull verification context from the existing `VerifiedPatientCache` in Dexie
  - [x] 6.3 Display "QR verification imported from patient lookup" as a read-only confirmation

- [x] Task 7: Tests (AC: all)
  - [x] 7.1 Unit test: verification record created with correct methods array
  - [x] 7.2 Unit test: two-identifier minimum enforced — cannot proceed with 0 or 1 methods without override
  - [x] 7.3 Unit test: single-identifier override requires deviation reason
  - [x] 7.4 Unit test: `isComplete` flag correctly computed based on method count
  - [x] 7.5 Unit test: `PATIENT_IDENTITY_VERIFIED` audit event emitted with correct metadata
  - [x] 7.6 Unit test: audit metadata never contains PHI (no patient name, no full ID number)
  - [x] 7.7 Unit test: QR code method auto-populated when patient was QR-verified
  - [x] 7.8 Unit test: verification record linked to sample via sampleId
  - [x] 7.9 Component test: "Proceed" button disabled with < 2 methods selected
  - [x] 7.10 Component test: warning banner shown on single-identifier attempt
  - [x] 7.11 RTL snapshot test: PatientVerificationForm renders correctly in both LTR and RTL
  - [x] 7.12 Offline test: verification stored in Dexie and synced when online

## Dev Notes

### Architecture

Patient identity verification is a **pre-condition** for sample collection, not a separate workflow. It inserts into the sample accessioning flow from Story 42.3 as a mandatory step between "Select Patient" and "Receive Sample."

The two-identifier minimum follows the WHO patient identification standard and Afghan MoPH requirements. This is a safety-critical control — labs must be able to prove they verified the right patient.

### Verification Methods Enum

```typescript
export enum PatientVerificationMethod {
  NATIONAL_ID_SCANNED = 'NATIONAL_ID_SCANNED',
  VERBAL_CONFIRMATION = 'VERBAL_CONFIRMATION',
  QR_CODE = 'QR_CODE',
  WRISTBAND_SCANNED = 'WRISTBAND_SCANNED',
  OTHER = 'OTHER',
}
```

### Data Minimization (CLAUDE.md Rule #7)

The verification record must NOT store:
- Full National ID number (only log that it was scanned, optionally last 4 digits)
- Patient name or father's name (only log that verbal confirmation occurred)
- QR code payload content (only log that QR was scanned and matched)

The verification record stores the **method** not the **data**. This is critical for CLAUDE.md compliance.

### Integration with Existing QR Verification

Lab-Lite already has `PatientVerifyScanner.tsx` and `PatientVerifyForm.tsx` for initial patient lookup. The verification logging form should detect if QR was already used during patient lookup and auto-check that method. The tech then adds a second method (typically verbal confirmation or National ID) to meet the two-identifier minimum.

### Dexie Schema Addition (db.ts)

This story adds a `patientVerifications` table. Coordinate with Story 43.3 which also adds a table — ensure version numbers do not conflict. If 43.3 uses version 4, this story should use version 5, or both should be combined into a single version bump.

```typescript
this.version(N).stores({
  // ... existing tables ...
  patientVerifications: '&id, sampleId, patientRef, verifiedAt',
})
```

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/components/verification/PatientVerificationForm.tsx` | Verification method selection UI |
| `apps/lab-lite/src/lib/verification-service.ts` | Verification record creation, validation, persistence |
| `apps/lab-lite/src/__tests__/patient-verification.test.ts` | Unit tests for verification logic |
| `apps/lab-lite/src/__tests__/patient-verification-ui.test.tsx` | Component tests for verification UI |

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared-types/src/enums.ts` | Add `PatientVerificationMethod` enum, `PATIENT_IDENTITY_VERIFIED` to `AuditAction` |
| `packages/shared-types/src/fhir/diagnostic-report.schema.ts` | Add `PatientVerificationRecord` schema |
| `apps/lab-lite/src/lib/db.ts` | New version with `patientVerifications` table |
| `apps/lab-lite/src/lib/audit-client.ts` | Add `reportVerificationEvent()` helper |
| Sample accessioning component (from 42.3) | Insert verification step before "Receive Sample" |

### Pitfalls

1. **PHI leakage in verification records:** Never store the actual ID number, patient name, or QR payload. Store only the method enum value and a boolean/timestamp.
2. **Override without deviation reason:** The system must block single-identifier override if the deviation reason is empty. This is a legal requirement.
3. **Offline verification:** All verification logic must work offline. The record is stored in Dexie and synced later. No Hub API calls required during verification.
4. **Version conflict with 43.3:** Both stories add Dexie tables. Coordinate the version number to avoid migration conflicts.
5. **QR auto-population edge case:** If the patient was looked up by manual search (not QR), do not auto-check QR_CODE. Only auto-check if the `VerifiedPatientCache` entry was created via QR scan.

### Project Structure Notes

- Lab-Lite uses Next.js 15 App Router with `[locale]` dynamic segment
- Existing patient verification: `apps/lab-lite/src/components/PatientVerifyScanner.tsx` and `PatientVerifyForm.tsx`
- Existing verified patient cache: `VerifiedPatientCache` interface in `apps/lab-lite/src/lib/db.ts`
- All client components use `'use client'` directive
- Local storage: Dexie.js in `apps/lab-lite/src/lib/db.ts`
- Audit logging: `@ultranos/audit-logger/client` via `apps/lab-lite/src/lib/audit-client.ts`

### References

- Epic 43 definition: `_bmad-output/planning-artifacts/epics.md` (line 5627)
- Story 42.3 (Sample Accessioning & Chain of Custody) — integration point for verification step
- Story 43.1 (Immutable Result Audit Chain) — audit chain this story feeds into
- Story 12.2 (Restricted Patient Verification) — existing QR/manual patient lookup
- CLAUDE.md Rule #6: Every PHI access must emit audit event
- CLAUDE.md Rule #7: Lab Portal can only see patient name + age (data minimization)
- WHO Patient Identification guidelines — two-identifier minimum standard

## Dev Agent Record

### Implementation Plan

Implemented TDD red-green-refactor cycle across 7 tasks:

1. **Types & Schema**: Added `PatientVerificationMethod` enum (5 values), `PATIENT_IDENTITY_VERIFIED` to `AuditAction`, and `PatientVerificationRecord` interface with `syncStatus` for offline-first behaviour.
2. **Dexie v5**: Added `patientVerifications: '&id, sampleId, patientRef, verifiedAt'` as v5 schema alongside `samples` and `custody_events` tables.
3. **Verification Service** (`verification-service.ts`): Pure business logic — `isVerificationComplete`, `validateVerification`, `createVerificationRecord`, `buildAuditMetadata`, `getDefaultMethodsForSource`. No DB or network coupling.
4. **PatientVerificationForm**: React component with 4 method checkboxes, detail inputs (National ID last-4, OTHER description), warning banner (`role="alert"`) at 1 method, override checkbox + textarea, completeness indicator, RTL via `dir="auto"` and logical CSS.
5. **reportVerificationEvent**: Fire-and-forget audit helper in `audit-client.ts` using `AuditAction.PATIENT_IDENTITY_VERIFIED` and `AuditResourceType.SPECIMEN`. PHI-clean metadata.
6. **ReceiveSampleModal**: Three-step state machine `'verification' → 'sampleDetails' → (confirmedSampleId !== null)`. Verification mandatory before sample form. Verification record linked to specimen.id after `accessionSample()` succeeds.
7. **SampleDetailView**: Loads verification record on mount, renders green/yellow badge inline. Yellow `role="alert"` deviation panel when `isComplete === false`. Verification timeline entry above CustodyTimeline.
8. **IncompleteVerificationsAlert**: Supervisor filter component using `getIncompleteVerifications()`, mounted in worklist page, renders nothing when all verifications complete.

### Completion Notes

- All 39 tests pass (26 unit, 13 component): `patient-verification.test.ts`, `patient-verification-ui.test.tsx`
- PHI compliance maintained throughout: no patient names, no full ID numbers in any assertion, log, or metadata
- `syncStatus: 'pending'` on all verification records — offline-first design verified by 7.12 tests
- QR auto-integration wired via `verificationSource` prop on `ReceiveSampleModal` → `getDefaultMethodsForSource()` → `defaultMethods` on `PatientVerificationForm`
- National ID detail input enforces `maxLength={4}` (last-4 only, per data minimization)
- Full lab-lite test suite passes without regressions introduced by this story

### Debug Log

- `enqueueSyncEvent` was missing from db.ts (referenced by sample-service.ts); added implementation
- db.ts file had version conflict risk with Story 44.3 (which used v4); added v5 schema preserving all v4 tables
- UI tests needed `vi.mock('next-intl')` to return key-as-translation; adjusted assertions to match key patterns rather than English text
- `crypto.randomUUID()` used throughout (no uuid npm package in project)
- `PatientVerificationRecord` added to `diagnostic-report.schema.ts` (co-located with related FHIR types per project convention)

## File List

**Created:**
- `apps/lab-lite/src/components/verification/PatientVerificationForm.tsx`
- `apps/lab-lite/src/components/verification/IncompleteVerificationsAlert.tsx`
- `apps/lab-lite/src/lib/verification-service.ts`
- `apps/lab-lite/src/__tests__/patient-verification.test.ts`
- `apps/lab-lite/src/__tests__/patient-verification-ui.test.tsx`

**Modified:**
- `packages/shared-types/src/enums.ts` — `PatientVerificationMethod` enum + `PATIENT_IDENTITY_VERIFIED` in `AuditAction`
- `packages/shared-types/src/fhir/diagnostic-report.schema.ts` — `PatientVerificationRecord` interface
- `apps/lab-lite/src/lib/db.ts` — v5 Dexie schema (`patientVerifications` + `samples` + `custody_events`), `saveVerificationRecord`, `getVerificationBySampleId`, `getIncompleteVerifications`, `markVerificationSynced` helpers
- `apps/lab-lite/src/lib/audit-client.ts` — `reportVerificationEvent()` helper
- `apps/lab-lite/src/components/samples/ReceiveSampleModal.tsx` — 3-step verification-first flow
- `apps/lab-lite/src/components/samples/SampleDetailView.tsx` — verification badge + deviation panel + timeline entry
- `apps/lab-lite/src/app/[locale]/worklist/page.tsx` — `IncompleteVerificationsAlert` supervisor filter

## Change Log

- 2026-05-31: Story 43.4 implemented. Added PatientVerificationMethod enum, PatientVerificationRecord, verification service, PatientVerificationForm component, reportVerificationEvent audit helper, ReceiveSampleModal 3-step flow, SampleDetailView verification badge, IncompleteVerificationsAlert supervisor filter. All 39 tests passing.

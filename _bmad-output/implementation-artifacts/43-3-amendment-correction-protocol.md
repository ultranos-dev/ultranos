# Story 43.3: Amendment & Correction Protocol

Status: ready-for-dev

## Story

As a lab technician,
I want to correct a released result with full traceability and mandatory notification,
So that errors are fixed transparently while preserving the complete history for legal and clinical purposes.

## Acceptance Criteria

1. **Given** a released result needs correction, **when** a tech initiates an amendment, **then** the original result is preserved and marked as superseded (never deleted or overwritten)
2. **And** the amendment requires: mandatory reason code (clerical error, instrument malfunction, wrong patient, QC failure discovered post-release), free-text explanation, and supervisor authorization
3. **And** the ordering physician is automatically notified of the correction with both original and amended values
4. **And** if the patient has already viewed the result in Patient-Lite, a patient notification is also generated
5. **And** the digital logbook receives a new entry referencing the original with amendment details
6. **And** the full amendment chain is visible in the audit trail

## Tasks / Subtasks

- [ ] Task 1: Amendment reason codes enum and data model (AC: #1, #2)
  - [ ] 1.1 Add `AmendmentReasonCode` enum to `packages/shared-types/src/enums.ts`: `CLERICAL_ERROR`, `INSTRUMENT_MALFUNCTION`, `WRONG_PATIENT`, `QC_FAILURE_POST_RELEASE`, `TRANSCRIPTION_ERROR`, `OTHER`
  - [ ] 1.2 Add `RESULT_AMENDED` to `AuditAction` enum in `packages/shared-types/src/enums.ts`
  - [ ] 1.3 Create `AmendmentRecord` interface in `packages/shared-types/src/fhir/diagnostic-report.schema.ts`:
    - `id: string` (UUID)
    - `originalReportId: string` (reference to superseded DiagnosticReport)
    - `amendedReportId: string` (reference to new DiagnosticReport)
    - `reasonCode: AmendmentReasonCode`
    - `reasonText: string` (free-text explanation)
    - `authorizedBy: string` (supervisor practitioner ID)
    - `authorizedAt: string` (ISO 8601)
    - `initiatedBy: string` (tech who started the amendment)
    - `initiatedAt: string` (ISO 8601)
    - `originalValues: Record<string, unknown>` (snapshot of original result values)
    - `amendedValues: Record<string, unknown>` (new corrected values)
    - `hlcTimestamp: string`
  - [ ] 1.4 Add Dexie table `amendments` to `apps/lab-lite/src/lib/db.ts` (version 4): `&id, originalReportId, amendedReportId, initiatedAt`

- [ ] Task 2: Original result preservation logic (AC: #1)
  - [ ] 2.1 Create `apps/lab-lite/src/lib/amendment-service.ts` with `initiateAmendment(reportId)` function
  - [ ] 2.2 Deep-clone the original DiagnosticReport before any modification
  - [ ] 2.3 Update original report status to `'amended'` (FHIR DiagnosticReport status — already in the schema enum)
  - [ ] 2.4 Create new DiagnosticReport with status `'corrected'` linked to original via `_ultranos.amendsReportId`
  - [ ] 2.5 Both original and corrected reports stored in Dexie; original is read-only after supersession

- [ ] Task 3: Supervisor authorization gate (AC: #2)
  - [ ] 3.1 Create `apps/lab-lite/src/components/amendments/SupervisorAuthGate.tsx` — modal dialog requiring supervisor credentials
  - [ ] 3.2 Supervisor enters their practitioner ID or scans QR (if available) to authorize
  - [ ] 3.3 Validate supervisor role is `LAB_SUPERVISOR` or `LAB_MANAGER` from session or Hub API lookup
  - [ ] 3.4 If current user has supervisor role, allow self-authorization with mandatory reason acknowledgment
  - [ ] 3.5 Authorization attempt (success or failure) emits audit event

- [ ] Task 4: Amendment UI (AC: #1, #2)
  - [ ] 4.1 Create `apps/lab-lite/src/components/amendments/AmendResultModal.tsx` — full amendment workflow
  - [ ] 4.2 Step 1: Display original result values (read-only) alongside editable fields for corrected values
  - [ ] 4.3 Step 2: Mandatory reason code dropdown + free-text explanation (minimum 10 characters)
  - [ ] 4.4 Step 3: Supervisor authorization gate (Task 3)
  - [ ] 4.5 Step 4: Confirmation summary showing diff of original vs. amended before commit
  - [ ] 4.6 "Amend" button enabled only when all mandatory fields are filled and supervisor has authorized
  - [ ] 4.7 Add "Amend Result" action button to the result detail view (only visible for released/final results)
  - [ ] 4.8 RTL support: all layout uses logical CSS properties; form flows correctly in Arabic/Dari/Pashto

- [ ] Task 5: Physician notification cascade (AC: #3)
  - [ ] 5.1 On amendment commit, create a notification of type `RESULT_AMENDED` targeting the ordering physician
  - [ ] 5.2 Notification payload includes: original result summary (non-PHI identifiers only), amended result summary, reason code, amendment timestamp
  - [ ] 5.3 Queue notification via sync engine for offline delivery
  - [ ] 5.4 Use existing `notification.create` tRPC endpoint on Hub API

- [ ] Task 6: Patient notification (AC: #4)
  - [ ] 6.1 Check Hub API for patient result view status: has the patient accessed this DiagnosticReport in Patient-Lite?
  - [ ] 6.2 If patient has viewed the result, generate a `RESULT_AMENDED_PATIENT` notification for Patient-Lite
  - [ ] 6.3 Patient notification payload: test name, "Your result has been updated — please review the corrected values with your doctor" (no PHI in notification text)
  - [ ] 6.4 If offline, queue the patient-viewed check for execution on reconnect

- [ ] Task 7: Logbook amendment entry (AC: #5)
  - [ ] 7.1 Append a new logbook entry of type `AMENDMENT` referencing the original logbook entry's sequential number
  - [ ] 7.2 Logbook entry includes: amendment date, original result reference, corrected result reference, reason code, supervisor ID
  - [ ] 7.3 Logbook entries are append-only per 42.8 — never modify the original logbook entry

- [ ] Task 8: Audit trail for amendment chain (AC: #6)
  - [ ] 8.1 Emit `RESULT_AMENDED` audit event on amendment initiation with metadata: `{ originalReportId, reasonCode, initiatedBy }`
  - [ ] 8.2 Emit `RESULT_AMENDED` audit event on supervisor authorization with metadata: `{ authorizedBy, originalReportId, amendedReportId }`
  - [ ] 8.3 Emit `RESULT_AMENDED` audit event on amendment completion with metadata: `{ originalReportId, amendedReportId, reasonCode, reasonText, notificationsSent }`
  - [ ] 8.4 Amendment chain view: `apps/lab-lite/src/components/amendments/AmendmentChainView.tsx` — displays chronological list of all amendments for a given original report
  - [ ] 8.5 Each chain entry shows: version number, actor, timestamp, reason, diff summary

- [ ] Task 9: Tests (AC: all)
  - [ ] 9.1 Unit test: `initiateAmendment()` preserves original report as read-only, creates corrected copy
  - [ ] 9.2 Unit test: amendment requires all mandatory fields (reason code, free-text, supervisor auth)
  - [ ] 9.3 Unit test: amendment with missing reason code or empty explanation is rejected
  - [ ] 9.4 Unit test: non-supervisor role cannot authorize an amendment
  - [ ] 9.5 Unit test: physician notification is created on amendment commit
  - [ ] 9.6 Unit test: patient notification is created only if patient has viewed the result
  - [ ] 9.7 Unit test: logbook entry is appended (not modified) on amendment
  - [ ] 9.8 Unit test: audit events are emitted at each stage (initiation, authorization, completion)
  - [ ] 9.9 Unit test: amendment chain correctly links multiple sequential amendments
  - [ ] 9.10 RTL snapshot test: AmendResultModal renders correctly in both LTR and RTL
  - [ ] 9.11 Offline test: amendment queued when offline, synced on reconnect

## Dev Notes

### Architecture

The amendment workflow follows the FHIR R4 DiagnosticReport status model. FHIR defines `amended` and `corrected` statuses specifically for this purpose:
- Original report: status changes from `final` to `amended` (or `entered-in-error` for wrong-patient cases)
- New report: created with status `corrected`, linking back to original via `_ultranos.amendsReportId`

This is a **three-actor workflow**: tech initiates, supervisor authorizes, system notifies. The supervisor gate is critical for legal defensibility in Afghan MoPH regulatory context.

### Amendment Reason Codes

```typescript
export enum AmendmentReasonCode {
  CLERICAL_ERROR = 'CLERICAL_ERROR',             // Typo, wrong value transcribed
  INSTRUMENT_MALFUNCTION = 'INSTRUMENT_MALFUNCTION', // Analyzer produced bad result
  WRONG_PATIENT = 'WRONG_PATIENT',               // Result attributed to wrong patient
  QC_FAILURE_POST_RELEASE = 'QC_FAILURE_POST_RELEASE', // QC found failing after release
  TRANSCRIPTION_ERROR = 'TRANSCRIPTION_ERROR',     // Manual entry error
  OTHER = 'OTHER',                                 // Requires longer free-text explanation
}
```

When `WRONG_PATIENT` is selected, the original report should also be set to `entered-in-error` (not `amended`) per FHIR semantics. This is an important edge case.

### Supervisor Authorization

Supervisor auth is a local gate, not a Hub roundtrip. The supervisor provides their practitioner ID and the system validates their role from the locally cached role data. This works offline. The authorization event is audit-logged locally and synced later.

If no supervisor is available (e.g., single-tech lab after hours), the amendment is saved in a `PENDING_AUTHORIZATION` state and the system generates an alert for the next supervisor login.

### Notification Strategy

- Physician notifications use the existing `notification.create` tRPC procedure (Story 12.4 / 17.4)
- Patient view status check: Hub API query `diagnosticReport.viewStatus` — if this endpoint does not exist yet, create a lightweight Hub query that checks whether the patient's access log contains a READ event for the specific DiagnosticReport ID
- Both notification types are queued via the sync engine when offline

### Dexie Schema Addition (db.ts version 4)

```typescript
this.version(4).stores({
  // ... existing tables ...
  amendments: '&id, originalReportId, amendedReportId, initiatedAt',
})
```

### Files to Create

| File | Purpose |
|------|---------|
| `apps/lab-lite/src/lib/amendment-service.ts` | Core amendment logic: initiate, authorize, commit |
| `apps/lab-lite/src/components/amendments/AmendResultModal.tsx` | Multi-step amendment wizard UI |
| `apps/lab-lite/src/components/amendments/SupervisorAuthGate.tsx` | Supervisor credential entry modal |
| `apps/lab-lite/src/components/amendments/AmendmentChainView.tsx` | Chronological amendment history display |
| `apps/lab-lite/src/__tests__/amendment-service.test.ts` | Unit tests for amendment logic |
| `apps/lab-lite/src/__tests__/amendment-ui.test.tsx` | Component tests for amendment UI |

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared-types/src/enums.ts` | Add `AmendmentReasonCode` enum, `RESULT_AMENDED` to `AuditAction` |
| `packages/shared-types/src/fhir/diagnostic-report.schema.ts` | Add `AmendmentRecord` schema, add `_ultranos.amendsReportId` field |
| `apps/lab-lite/src/lib/db.ts` | Version 4 migration with `amendments` table |
| `apps/lab-lite/src/lib/audit-client.ts` | Add `reportAmendmentEvent()` helper |
| Result detail view component | Add "Amend Result" button for final/released results |

### Pitfalls

1. **Never delete or overwrite the original result.** This is a legal requirement. The original must remain intact with its original timestamp and values.
2. **Amendment of an amendment:** A corrected report can itself be amended. The chain must handle N-deep amendments. Use `amendmentChainHead` to track the root original.
3. **Offline amendment + sync conflict:** If a result is amended offline on two devices, this is a Tier 1 conflict (safety-critical). Both amendments must be preserved with a conflict flag for supervisor review.
4. **PHI in notifications:** Notification payloads must NOT contain result values. Use opaque references only (report ID, test category code).
5. **Wrong-patient amendments** require extra steps: the original report status becomes `entered-in-error`, and the correct patient must be identified before the corrected report is created.

### Project Structure Notes

- Lab-Lite uses Next.js 15 App Router with `[locale]` dynamic segment
- All client components use `'use client'` directive
- State management: Zustand stores in `apps/lab-lite/src/stores/`
- Local storage: Dexie.js in `apps/lab-lite/src/lib/db.ts`
- Audit logging: `@ultranos/audit-logger/client` via `apps/lab-lite/src/lib/audit-client.ts`
- HLC timestamps: `apps/lab-lite/src/lib/hlc.ts` (shared singleton)
- i18n: `next-intl` with translation keys in `apps/lab-lite/src/i18n/`

### References

- Epic 43 definition: `_bmad-output/planning-artifacts/epics.md` (line 5610)
- Story 43.1 (Immutable Result Audit Chain) — audit chain foundation this story depends on
- Story 43.2 (QC-Result Temporal Binding) — QC status snapshot linked to results
- Story 42.5 (Result Authorization Workflow) — release workflow this story amends
- Story 42.8 (Digital Lab Logbook) — logbook append-only pattern this story extends
- Story 12.4 / 17.4 (Notification Center) — notification dispatch mechanism
- FHIR R4 DiagnosticReport: https://hl7.org/fhir/R4/diagnosticreport.html (status lifecycle)
- CLAUDE.md Rule #6: Every PHI access must emit audit event
- CLAUDE.md Rule #7: Lab Portal can only see patient name + age

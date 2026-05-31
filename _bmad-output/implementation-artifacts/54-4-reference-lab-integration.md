# Story 54.4: External Reference Lab Integration

Status: draft

## Story

As a lab technician sending samples to a reference lab,
I want to manage send-outs with tracking and result import,
so that reference lab results are incorporated into the patient's record seamlessly.

## Acceptance Criteria

1. **Given** a test cannot be performed locally, **when** the tech initiates a "Send to Reference Lab", **then** the system generates: a referral form (patient ID, test requested, clinical context summary), a shipping manifest, and a tracking record.
2. **And** the referral form contains only: patient first name, age, sample type, test requested (LOINC code + display name), and relevant clinical context (e.g., "suspected TB" — no full medical history). Data minimization applies.
3. **And** the tech can select from a configurable list of reference labs (name, accreditation number, address, supported test catalog, average TAT).
4. **And** the system tracks status through a pipeline: Sent -> Received by Reference Lab -> Processing -> Results Available.
5. **And** status transitions can be updated manually (tech enters status from phone call / email from reference lab) or via structured data import if the reference lab provides it.
6. **And** results from the reference lab can be entered manually (structured result entry form) or imported via structured data (CSV, HL7 message, or JSON).
7. **And** the result report is attributed: "Performed at: [Reference Lab Name], Accreditation #[X]" — clearly distinguishing externally performed tests from local results.
8. **And** TAT tracking shows: average reference lab TAT per test type, current pending send-outs with elapsed time, and alerts when a send-out exceeds the expected TAT by a configurable threshold.
9. **And** every send-out creation, status change, and result import emits an audit event via `@ultranos/audit-logger`.
10. **And** all data persists in Dexie for offline access; send-out records sync to Hub when online.
11. **And** no PHI beyond first name + age appears in any log, error, or UI label (CLAUDE.md Rule #7).

## Tasks / Subtasks

- [ ] **Task 1: Reference lab type definitions** (AC: 1, 3, 4)
  - [ ] 1.1 Create `apps/lab-lite/src/types/reference-lab.ts` defining:
    - `ReferenceLab` interface: `id` (UUID), `name`, `accreditationNumber`, `address`, `contactPhone`, `contactEmail`, `supportedTests` (array of LOINC codes), `averageTATDays` (per test type map), `isActive` (boolean), `meta`, `_ultranos`.
    - `SendOut` interface: `id` (UUID), `sampleId` (FK to Specimen), `referenceLabId` (FK to ReferenceLab), `testRequested` (LOINC code + display name), `clinicalContext` (short text), `status` ('sent' | 'received' | 'processing' | 'results-available' | 'cancelled'), `sentAt` (HLC timestamp), `receivedAt`, `processingStartedAt`, `resultsAvailableAt` (all HLC, nullable), `shippingManifestId`, `referralFormId`, `resultId` (FK to result, nullable), `meta`, `_ultranos`.
    - `SendOutStatusTransition` interface: `id`, `sendOutId`, `fromStatus`, `toStatus`, `timestamp`, `updatedBy`, `source` ('manual' | 'import'), `notes`.
  - [ ] 1.2 Export types from `apps/lab-lite/src/types/index.ts`.

- [ ] **Task 2: Dexie schema migration — `reference_labs`, `send_outs`, `send_out_transitions` tables** (AC: 3, 10)
  - [ ] 2.1 Add new Dexie version to `apps/lab-lite/src/lib/db.ts` with:
    - `reference_labs`: `&id, name, isActive`
    - `send_outs`: `&id, sampleId, referenceLabId, status, sentAt`
    - `send_out_transitions`: `&id, sendOutId, timestamp`
  - [ ] 2.2 Add typed `Dexie.Table` properties.
  - [ ] 2.3 Add CRUD helpers: `putReferenceLab()`, `getActiveReferenceLabs()`, `createSendOut()`, `getSendOutsByStatus()`, `getSendOutsForSample()`, `addSendOutTransition()`.

- [ ] **Task 3: Reference lab configuration service** (AC: 3)
  - [ ] 3.1 Create `apps/lab-lite/src/lib/reference-lab-config.ts`.
  - [ ] 3.2 `addReferenceLab(input: CreateRefLabInput): Promise<ReferenceLab>` — validates input, persists to Dexie, emits audit event.
  - [ ] 3.3 `updateReferenceLab(id: string, updates: Partial<ReferenceLab>): Promise<ReferenceLab>` — updates and emits audit event.
  - [ ] 3.4 `deactivateReferenceLab(id: string): Promise<void>` — soft-deactivate, emits audit event.
  - [ ] 3.5 `getLabsForTest(loincCode: string): Promise<ReferenceLab[]>` — returns reference labs that support the given test.

- [ ] **Task 4: Send-out service** (AC: 1, 2, 4, 5, 7, 9)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/sendout-service.ts`.
  - [ ] 4.2 `createSendOut(input: CreateSendOutInput): Promise<SendOut>` — validates input, creates send-out record with status 'sent', generates referral form and shipping manifest, creates custody event (type: 'reference-lab-sendout'), emits audit event. Input: `{ sampleId, referenceLabId, testRequested, clinicalContext }`.
  - [ ] 4.3 `updateSendOutStatus(sendOutId: string, newStatus: SendOutStatus, source: 'manual' | 'import', actorId: string, notes?: string): Promise<SendOut>` — validates allowed transitions (forward-only: sent -> received -> processing -> results-available), creates transition record, emits audit event. Cancelled is allowed from any state.
  - [ ] 4.4 `importResult(sendOutId: string, resultData: StructuredResult, actorId: string): Promise<void>` — creates lab result record with attribution ("Performed at: [Lab Name], Accreditation #[X]"), transitions status to 'results-available', links result to send-out, emits audit event.
  - [ ] 4.5 `generateReferralForm(sendOut: SendOut, sample: FhirSpecimen, referenceLab: ReferenceLab): ReferralForm` — compiles referral form with data-minimized patient info (first name + age only), test requested, clinical context, sample type.
  - [ ] 4.6 `generateShippingManifest(sendOuts: SendOut[]): ShippingManifest` — compiles manifest for multiple send-outs going to the same reference lab in one shipment.

- [ ] **Task 5: TAT tracking service** (AC: 8)
  - [ ] 5.1 Create `apps/lab-lite/src/lib/sendout-tat.ts`.
  - [ ] 5.2 `calculatePendingTAT(sendOutId: string): { elapsedDays: number, expectedDays: number, isOverdue: boolean }` — compares elapsed time since 'sent' against reference lab's average TAT for the test type.
  - [ ] 5.3 `getOverdueSendOuts(thresholdMultiplier?: number): Promise<SendOut[]>` — returns send-outs exceeding expected TAT by configurable threshold (default: 1.5x average TAT). Sorted by most overdue first.
  - [ ] 5.4 `getAverageTATByLab(referenceLabId: string): Promise<Record<string, number>>` — calculates actual average TAT per test type from historical completed send-outs.
  - [ ] 5.5 TAT alerts integrate with the notification system (Story 42.7 notification patterns).

- [ ] **Task 6: Send-Out initiation UI** (AC: 1, 2, 3)
  - [ ] 6.1 Create `apps/lab-lite/src/components/sendout/SendOutModal.tsx`.
  - [ ] 6.2 Triggered from sample detail screen or order worklist when a test is not locally available.
  - [ ] 6.3 Form fields:
    - Reference Lab: select from active reference labs filtered by test support.
    - Test Requested: pre-populated from order, LOINC code + display name.
    - Clinical Context: textarea (short — guided by placeholder: "e.g., suspected TB, follow-up after treatment").
    - Sample Type: pre-populated from specimen record.
  - [ ] 6.4 Preview pane shows the referral form before confirmation.
  - [ ] 6.5 On confirmation: calls `createSendOut()`, shows success with tracking number, offers to print referral form and manifest.

- [ ] **Task 7: Send-Out Tracking dashboard** (AC: 4, 8)
  - [ ] 7.1 Create `apps/lab-lite/src/app/[locale]/sendouts/page.tsx` — send-out tracking page.
  - [ ] 7.2 Table/list view: all send-outs with columns — tracking ID, reference lab name, test requested, date sent, current status, elapsed days, expected TAT, status indicator (green/amber/red).
  - [ ] 7.3 Filters: by status (sent/received/processing/results-available/all), by reference lab, by date range.
  - [ ] 7.4 Overdue alert banner at top: "3 send-outs are overdue" with link to filtered view.

- [ ] **Task 8: Status Update UI** (AC: 4, 5)
  - [ ] 8.1 Create `apps/lab-lite/src/components/sendout/StatusUpdateModal.tsx`.
  - [ ] 8.2 Accessible from the send-out tracking row.
  - [ ] 8.3 Shows current status pipeline with active step highlighted.
  - [ ] 8.4 "Update Status" button advances to next status. Notes field for context (e.g., "Called reference lab, they received sample yesterday").
  - [ ] 8.5 Source is always 'manual' from this UI. 'Import' source is used by the result import flow.

- [ ] **Task 9: Result Import UI** (AC: 6, 7)
  - [ ] 9.1 Create `apps/lab-lite/src/components/sendout/ResultImportModal.tsx`.
  - [ ] 9.2 Two modes:
    - Manual Entry: structured form matching the lab result template (from Story 42.4) with all fields editable.
    - File Import: upload CSV/JSON file with structured result data. Parser validates format and shows preview before import.
  - [ ] 9.3 Result attribution is automatically applied: "Performed at: [Reference Lab Name], Accreditation #[X]" — displayed on the result and non-editable.
  - [ ] 9.4 On import: calls `importResult()`, transitions send-out status, shows confirmation.

- [ ] **Task 10: Reference Lab Configuration UI** (AC: 3)
  - [ ] 10.1 Create `apps/lab-lite/src/components/sendout/ReferenceLabConfigPanel.tsx`.
  - [ ] 10.2 Accessible from lab settings page.
  - [ ] 10.3 Add/Edit/Deactivate reference labs. Fields: name, accreditation number, address, phone, email, supported tests (multi-select from LOINC catalog), average TAT per test type.
  - [ ] 10.4 Only `lab_manager` and `lab_supervisor` roles can modify reference lab configuration.

- [ ] **Task 11: Referral form and manifest PDF generation** (AC: 1, 2)
  - [ ] 11.1 Create `apps/lab-lite/src/lib/sendout-pdf.ts`.
  - [ ] 11.2 `renderReferralFormPDF(referralForm: ReferralForm): Blob` — generates printable PDF with: patient first name + age (NO additional PHI), sample type, test requested, clinical context, originating lab info, date sent.
  - [ ] 11.3 `renderShippingManifestPDF(manifest: ShippingManifest): Blob` — generates printable manifest listing all samples in the shipment with tracking numbers.

- [ ] **Task 12: Sidebar navigation update** (AC: 4)
  - [ ] 12.1 Add "Send-Outs" navigation item to `apps/lab-lite/src/components/AppSidebar.tsx`.
  - [ ] 12.2 Show badge with pending/overdue count.
  - [ ] 12.3 Icon: external-link or send icon (must NOT mirror in RTL — represents outbound direction semantically).

- [ ] **Task 13: Send-out audit events** (AC: 9)
  - [ ] 13.1 Add audit event types in `apps/lab-lite/src/lib/audit-client.ts`: `SENDOUT_CREATED`, `SENDOUT_STATUS_UPDATED`, `SENDOUT_RESULT_IMPORTED`, `SENDOUT_REFERRAL_GENERATED`, `REFERENCE_LAB_CONFIGURED`.
  - [ ] 13.2 All events include `sendOutId`, `referenceLabId`, `actorId`, `timestamp`.

- [ ] **Task 14: Tests** (AC: 1-11)
  - [ ] 14.1 Unit tests for `sendout-service.ts`: create send-out, status transitions (valid and invalid), result import with attribution.
  - [ ] 14.2 Unit tests for `sendout-tat.ts`: TAT calculation, overdue detection, average TAT computation.
  - [ ] 14.3 Unit tests for `reference-lab-config.ts`: CRUD operations, test filtering.
  - [ ] 14.4 Unit tests for referral form and manifest generation: data minimization validation (no PHI beyond first name + age).
  - [ ] 14.5 Component tests for `SendOutModal.tsx`: form validation, referral form preview.
  - [ ] 14.6 Component tests for `ResultImportModal.tsx`: manual entry and file import flows.
  - [ ] 14.7 Component tests for send-out tracking dashboard: filtering, overdue alerts, status display.
  - [ ] 14.8 Audit event emission assertions for all send-out operations.
  - [ ] 14.9 RTL layout tests for send-out components.

## Dev Notes

- **Send-out workflow** covers the full lifecycle of samples sent to external reference labs: referral form generation, shipping manifest, status tracking, and result import. This is common in rural labs that lack advanced analyzers.
- **Referral form generation** must comply with data minimization (Rule #7). The form contains patient first name + age, sample type, test requested, and clinical context. No medical history, no diagnosis codes, no additional demographics.
- **Status pipeline** (Sent -> Received -> Processing -> Results Available) is forward-only. Manual status updates are the primary method because most reference labs in Afghanistan/MENA communicate via phone calls. Structured import is a progressive enhancement for labs with digital systems.
- **Result attribution** ("Performed at: [Reference Lab]") is automatically applied and non-editable. This is a quality/regulatory requirement: the clinician must know which lab performed the test.
- **TAT tracking and overdue alerts** help lab managers follow up on delayed results. The threshold is configurable because different reference labs and test types have different expected turnaround times.
- **Result import** supports manual entry (most common) and structured file import (CSV/JSON). HL7 message parsing can be added later as a progressive enhancement.

## Project Structure Notes

New files:
- `apps/lab-lite/src/types/reference-lab.ts`
- `apps/lab-lite/src/lib/reference-lab-config.ts`
- `apps/lab-lite/src/lib/sendout-service.ts`
- `apps/lab-lite/src/lib/sendout-tat.ts`
- `apps/lab-lite/src/lib/sendout-pdf.ts`
- `apps/lab-lite/src/app/[locale]/sendouts/page.tsx`
- `apps/lab-lite/src/components/sendout/SendOutModal.tsx`
- `apps/lab-lite/src/components/sendout/StatusUpdateModal.tsx`
- `apps/lab-lite/src/components/sendout/ResultImportModal.tsx`
- `apps/lab-lite/src/components/sendout/ReferenceLabConfigPanel.tsx`

Modified files:
- `apps/lab-lite/src/lib/db.ts` (new Dexie version with `reference_labs`, `send_outs`, `send_out_transitions` tables)
- `apps/lab-lite/src/lib/audit-client.ts` (send-out audit event types)
- `apps/lab-lite/src/components/AppSidebar.tsx` (add Send-Outs nav item)

## References

- Epic 54 definition: `_bmad-output/planning-artifacts/epics.md` (line 6623)
- CLAUDE.md: Data minimization Rule #7 (first name + age only on referral forms)
- Story 42.3: Sample Accessioning & Chain of Custody (CustodyEvent integration for send-out tracking)
- Story 42.4: Lab Result Templates & Structured Entry (result entry form patterns)
- Story 42.5: Result Authorization Workflow (authorization integration for imported results)
- Existing lab settings: `apps/lab-lite/src/components/settings/LabSettingsView.tsx`
- Existing sidebar: `apps/lab-lite/src/components/AppSidebar.tsx`
- Existing audit client: `apps/lab-lite/src/lib/audit-client.ts`
- LOINC categories: `apps/lab-lite/src/lib/loinc-categories.ts`

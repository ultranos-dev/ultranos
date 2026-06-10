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

## Review Findings

> Code review conducted 2026-06-10. Sources: Blind Hunter, Edge Case Hunter, Acceptance Auditor.
> **2 decision-needed · 16 patch · 1 deferred · 1 dismissed**

### Decision-Needed

_(All resolved — converted to patches below.)_

### Patch

- [x] [Review][Patch] **C1: Missing Dexie schema migration + helper functions (Task 2)** [`apps/lab-lite/src/lib/db.ts`] — `reference_labs`, `send_outs`, `send_out_transitions` tables not added to any `version().stores()` call; `putReferenceLab`, `getActiveReferenceLabs`, `createSendOut`, `getSendOutsByStatus`, `getSendOutsForSample`, `addSendOutTransition` not exported. Feature is entirely non-functional until a new Dexie version (v36) is added.
- [x] [Review][Patch] **C2: `reportSendOutAuditEvent` not exported from `audit-client.ts` (Task 13)** [`apps/lab-lite/src/lib/audit-client.ts`] — All service mutation calls import and invoke this function, but it does not exist. Every `initiateSendOut`, `updateSendOutStatus`, `importSendOutResult`, `addReferenceLab`, `updateReferenceLab` call will crash at runtime with a TypeError.
- [x] [Review][Patch] **C3: `importSendOutResult` writes incompatible object to `db.lab_results`** [`sendout-service.ts` L171–182] — `status: 'final'` is not in the `LabResult` union (`'draft'|'completed'`); required fields `sampleId`, `templateId`, `templateVersion`, `updatedAt` are omitted; `as any` bypasses TypeScript. Records with `status: 'final'` will never appear in queries filtering by valid statuses.
- [x] [Review][Patch] **C4: `importSendOutResult` spreads untrusted `resultData` without validation** [`sendout-service.ts` L171–182] — CSV/JSON file content from `ResultImportModal` is spread directly into the persisted record, allowing a malicious or malformed import file to overwrite `id`, `attribution`, `loincCode`, `sampleId`, `sendOutId`. Fix: whitelist the fields to accept from `resultData` before the spread.
- [x] [Review][Patch] **C5: `importSendOutResult` has no transaction — partial failure leaves inconsistent state** [`sendout-service.ts` L171–208] — Three sequential non-transactional writes (`lab_results.put`, `send_outs.put`, `updateSendOutStatus`). A crash between writes leaves a result with no `resultId` link or a send-out stuck in `processing`. Wrap in a Dexie transaction.
- [x] [Review][Patch] **H6: `importSendOutResult` double-emits audit event** [`sendout-service.ts` L197–208] — Calls `updateSendOutStatus(..., 'import', ...)` which emits `SENDOUT_STATUS_UPDATED`, then also emits `SENDOUT_RESULT_IMPORTED`. Two audit events for one user action; the status event fires before `resultId` is linked. Pass a `suppressAudit` flag to the internal `updateSendOutStatus` call or inline the status update.
- [x] [Review][Patch] **H7: `parseTimestamp` checks for `|` separator but HLC format uses `:`** [`sendout-tat.ts` L16] — `ts.includes('|')` never matches; the full HLC string (e.g. `"1750000000000:00000:node-id"`) is passed to `new Date()` → Invalid Date → NaN elapsed days → TAT overdue system never fires for any send-out. Fix: check `ts.includes(':')` and split on `:` to extract `parts[0]` as the wall-clock ms.
- [x] [Review][Patch] **H8: `getAverageTATByLab` measures elapsed to `Date.now()`, not `resultsAvailableAt`** [`sendout-tat.ts` L99–105] — Historical TAT averages grow monotonically over time (a 3-day TAT becomes 33 days after a month). Fix: `parseTimestamp(sendOut.resultsAvailableAt!).getTime() - parseTimestamp(sendOut.sentAt).getTime()`.
- [x] [Review][Patch] **H9: `renderReferralFormPDF` passes HLC-serialized `sentAt` to `new Date()`** [`sendout-pdf.ts` L46, `sendout-service.ts` L241] — `dateSent: sendOut.sentAt` where `sentAt` is `serializeHlc(hlc.now())`. `new Date("1750000000000:00000:node-id").toLocaleDateString()` → "Invalid Date" on the printed referral form. Fix: store/pass a separate ISO `sentAt` field or extract the wall-ms from the HLC before constructing the Date.
- [x] [Review][Patch] **H10: `useState` misuse for async lab name load in `ResultImportModal`** [`ResultImportModal.tsx` L33–37] — `useState(() => { asyncCall().then(setLabName) })` does not work; the initializer runs once synchronously and the `.then` fires after render without stable cleanup. Attribution banner always shows "…". Fix: replace with `useEffect(() => { getDb().reference_labs.get(...).then(lab => { if (lab) setLabName(...) }) }, [sendOut.referenceLabId])`.
- [x] [Review][Patch] **H11: Referral form preview shows i18n placeholder, not patient data** [`SendOutModal.tsx` L155] — `{t('sendOutPreviewPatientValue')}` renders a static string; `SendOutModalProps` has no `patientFirstName`/`patientAge` props. Tech cannot verify patient identity before dispatching. Add `patientFirstName: string` and `patientAge: number` props and render them in the preview.
- [x] [Review][Patch] **H12: TAT overdue threshold hardcoded at 1.5x — not configurable** [`sendout-tat.ts` L52] — AC #8 requires a configurable threshold. Add a `lab_config` entry (e.g. key `tatOverdueMultiplier`) readable by `getOverdueSendOuts` and `calculatePendingTAT`, consistent with existing `getLockTimeoutHours` pattern.
- [x] [Review][Patch] **H13: `types/index.ts` missing `reference-lab` re-export (Task 1.2)** [`apps/lab-lite/src/types/index.ts`] — The new `reference-lab.ts` types are not exported from the types index. Add `export * from './reference-lab'`.
- [x] [Review][Patch] **M14: `importSendOutResult` double versionId increment** [`sendout-service.ts` L189, L198] — The outer function increments `versionId` before calling `updateSendOutStatus`, which increments again. Final `versionId` = `original + 2` for one logical action — creates a gap in sync history. Fix: skip the first `db.send_outs.put(updated)` if `updateSendOutStatus` will handle the put, or inline the resultId assignment inside `updateSendOutStatus`.
- [x] [Review][Patch] **M15: `reportSendOutAuditEvent` calls not marked `void`** [`reference-lab-config.ts` L36, L53, L74; `sendout-service.ts` L24, L65, L137, L201] — If the audit function throws (e.g. Dexie unavailable), the exception propagates and crashes the mutation. All audit calls in `audit-client.ts` are fire-and-forget by convention. Prefix each call with `void` and wrap in try/catch if needed.
- [x] [Review][Patch] **M16: `confirm()` dialog for deactivation** [`ReferenceLabConfigPanel.tsx` L360] — `window.confirm()` is blocked in PWA standalone mode and many Android WebViews (primary deployment target). Replace with a ShadCN `Dialog` confirmation modal.
- [x] [Review][Patch] **DN17→P17: Remove `shippingManifestId` from `SendOut` type** [`types/reference-lab.ts`, `sendout-service.ts`] — Decision: manifest owns send-out IDs, not the reverse. Remove `shippingManifestId: string | null` from the `SendOut` interface; remove `shippingManifestId: uuidv4()` from `initiateSendOut`; update `generateShippingManifest` to generate its own UUID rather than reading from `sendOuts[0]`.
- [x] [Review][Patch] **DN18→P18: Block cancel transition from `results-available`** [`types/reference-lab.ts`, `StatusUpdateModal.tsx`] — Decision: results-available is a terminal state; cancellation after results creates orphaned `lab_results` records. Remove `'cancelled'` from `SENDOUT_ALLOWED_TRANSITIONS['results-available']`; disable the cancel button in `StatusUpdateModal` when `sendOut.status === 'results-available'`.

### Deferred

- [x] [Review][Defer] **D19: `sendout-pdf.ts` returns HTML Blob, not PDF** [`sendout-pdf.ts` L78, L137] — deferred, acknowledged design choice. Code comment states "A dedicated PDF library (jsPDF, react-pdf) can be substituted later without API changes." The function name `renderReferralFormPDF` and the file name `sendout-pdf.ts` are misleading but intentional. Track for resolution when a PDF library is evaluated.

---

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

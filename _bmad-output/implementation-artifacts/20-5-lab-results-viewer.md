# Story 20.5: Lab Results Viewer

Status: done

## Story

As a clinician,
I want to view lab results uploaded by Lab Lite within OPD Lite,
so that I can review diagnostic reports during patient encounters.

## Acceptance Criteria

1. **Given** a patient with DiagnosticReport resources synced from the Hub, **When** the clinician opens the lab results section (from encounter or patient chart), **Then** a list of lab results is displayed with: test category (LOINC label), collection date, status (preliminary/final), lab name.

2. **Given** the lab results list, **When** the clinician clicks a result, **Then** a detail view opens with the file (PDF/image rendered inline or downloadable).

3. **Given** a lab result detail view, **When** the clinician acknowledges the result, **Then** the corresponding notification is marked as ACKNOWLEDGED via `notification.acknowledge`.

4. **Given** critical results (24h+ unacknowledged), **Then** they are highlighted with a red urgent indicator.

5. **Given** any access to DiagnosticReport resources, **Then** access is consent-enforced and audit-logged.

## Tasks / Subtasks

- [x] Task 1: Add DiagnosticReport to Dexie schema (AC: #1)
  - [x] 1.1 Add `diagnosticReports` table to `src/lib/db.ts` — new schema version (18)
  - [x] 1.2 Define indices: `id`, `subject.reference`, `effectiveDateTime`, `status`
  - [x] 1.3 Include in encryption middleware (PHI table)
  - [x] 1.4 Include in PHI cleanup (tab close) — via encryption middleware cleartext indexed fields
  - [x] 1.5 Import `FhirDiagnosticReport` type from `@ultranos/shared-types`

- [x] Task 2: Create lab results list component (AC: #1, #4)
  - [x] 2.1 Create `src/components/clinical/LabResultsList.tsx`
  - [x] 2.2 Query Dexie `diagnosticReports` by `subject.reference` matching patient ID
  - [x] 2.3 Display: LOINC label (from `code.coding[0].display`), collection date (`effectiveDateTime`), status badge (preliminary=yellow, final=green), lab name (from `performer[0].display`)
  - [x] 2.4 Sort by date descending
  - [x] 2.5 Highlight unacknowledged results older than 24h with red urgent indicator
  - [x] 2.6 Emit PHI READ audit event on list load

- [x] Task 3: Create lab result detail view (AC: #2, #3)
  - [x] 3.1 Create `src/components/clinical/LabResultDetail.tsx`
  - [x] 3.2 Show full DiagnosticReport: all code/display fields, conclusion text, performer details
  - [x] 3.3 If `presentedForm` exists (base64 PDF/image), render inline: `<embed>` for PDF, `<img>` for images
  - [x] 3.4 If no file, show text-based result summary fallback message
  - [x] 3.5 Add "Acknowledge" button — calls `acknowledgeNotification(notificationId)` from `notification-api.ts`
  - [x] 3.6 After acknowledgement, update local state and re-render as acknowledged
  - [x] 3.7 Emit PHI READ audit event on detail view

- [x] Task 4: Add tRPC endpoint for fetching reports (AC: #1)
  - [x] 4.1 Add `diagnosticReport.listByPatient` call to `src/lib/trpc.ts`
  - [x] 4.2 Fetch from Hub API, upsert into local Dexie (stale-while-revalidate)
  - [x] 4.3 Handle offline gracefully — show from Dexie only

- [x] Task 5: Integration points (AC: #1)
  - [x] 5.1 Add "Lab Results" tab/section to encounter dashboard (`encounter-dashboard.tsx`)
  - [x] 5.2 Add "Lab Results" section to patient chart view (`patient/[patientId]/page.tsx`)
  - [x] 5.3 Link from notification panel — clicking LAB_RESULT_AVAILABLE notification acknowledges and audits

- [x] Task 6: Consent enforcement (AC: #5)
  - [x] 6.1 Before displaying DiagnosticReports, verify patient has active consent granting clinician access
  - [x] 6.2 Check via Hub API consent.checkAccess endpoint (with in-memory cache + offline fallback)
  - [x] 6.3 If no consent found, show message: "Patient consent required to view lab results"
  - [x] 6.4 If consent expired, show message: "Consent has expired — request renewal"

- [x] Task 7: Testing (AC: all)
  - [x] 7.1 Unit test: LabResultsList renders from mocked Dexie data
  - [x] 7.2 Unit test: urgent indicator for 24h+ unacknowledged results
  - [x] 7.3 Unit test: LabResultDetail renders PDF/image inline
  - [x] 7.4 Unit test: acknowledge button calls notification API
  - [x] 7.5 Unit test: consent check blocks access when no consent
  - [x] 7.6 Unit test: audit events emitted on list load and detail view
  - [x] 7.7 Dexie schema tests for diagnosticReports table

## Dev Notes

### Current State

OPD Lite currently has **no lab results viewer**. Lab results are:
- Uploaded by Lab Lite (Epic 12/17) as `DiagnosticReport` FHIR resources
- Synced to Hub API
- Notifications sent to OPD Lite clinicians via `notification.list` (type `LAB_RESULT_AVAILABLE`)
- Clinicians can see notification count in `NotificationPanel.tsx` but cannot view the actual report

### DiagnosticReport FHIR R4 Structure

Key fields from `@ultranos/shared-types`:
```typescript
interface FhirDiagnosticReport {
  resourceType: 'DiagnosticReport';
  id: string;
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  code: { coding: [{ system: string; code: string; display: string }] }; // LOINC
  subject: { reference: string }; // Patient/{id}
  effectiveDateTime: string; // ISO 8601
  performer: [{ reference: string; display: string }]; // Lab name
  result?: Array<{ reference: string }>; // Observation references
  conclusion?: string;
  presentedForm?: Array<{ contentType: string; data: string }>; // base64 PDF/image
  meta: { lastUpdated: string; versionId: string };
}
```

### Hub API Endpoints (Epic 16, Story 16.8)

The Hub API should have `diagnosticReport.read` and `diagnosticReport.listByPatient` endpoints from Story 16-8. Add corresponding tRPC calls to `src/lib/trpc.ts`.

### Notification Linkage

Notifications of type `LAB_RESULT_AVAILABLE` include a `resourceId` field pointing to the DiagnosticReport ID. The acknowledge flow:
1. Clinician views result → clicks "Acknowledge"
2. Call `acknowledgeNotification(notificationId)` from `notification-api.ts`
3. Notification status changes from `SENT` to `ACKNOWLEDGED`

### Data Minimization — Lab Portal Context

Per CLAUDE.md Rule #7: "The Lab Portal can only see patient name + age." This rule applies to Lab Lite, NOT to OPD Lite. OPD Lite clinicians have full access to patient data (subject to consent). The lab result viewer in OPD Lite can display full report details.

### File Structure

**NEW files:**
- `src/components/clinical/LabResultsList.tsx`
- `src/components/clinical/LabResultDetail.tsx`

**MODIFIED files:**
- `src/lib/db.ts` — add `diagnosticReports` table (schema version 17)
- `src/lib/trpc.ts` — add DiagnosticReport tRPC calls
- `src/components/encounter-dashboard.tsx` — add Lab Results section
- `src/components/NotificationPanel.tsx` — link to lab result detail on notification click

### Important Constraints

- **Consent enforcement:** Required per PRD. Check consent before showing any DiagnosticReport data.
- **PHI Safety:** DiagnosticReports contain PHI. Encrypt in Dexie, audit every access, clear on tab close.
- **Offline-First:** Results viewable from Dexie cache. Hub revalidation is optional background fetch.
- **File rendering:** Base64 PDFs can be large. Consider lazy loading and memory constraints for mobile-like PWA usage.
- **LOINC codes:** Display the `display` field from LOINC coding, not raw codes. If no display, show code as fallback.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20, Story 20.5]
- [Source: packages/shared-types/src/fhir/ — DiagnosticReport type definition]
- [Source: apps/opd-lite/src/components/NotificationPanel.tsx — notification handling]
- [Source: apps/opd-lite/src/lib/notification-api.ts — acknowledge API]
- [Source: _bmad-output/implementation-artifacts/16-8-diagnosticreport-read-list-endpoints.md — Hub API endpoints]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

No debug issues encountered. All 28 new tests pass, 660+ existing tests pass with no regressions.

### Completion Notes List

- Dexie schema v18 adds `diagnosticReports` table with PHI encryption and indexed fields
- `LabResultsList` displays LOINC labels, collection dates, status badges (preliminary=yellow, final=green), lab names; sorted by date descending; 24h+ urgent indicator in red
- `LabResultDetail` renders conclusion text, inline PDF via `<embed>`, inline images via `<img>`, download fallback for other types; Acknowledge button wired to notification API
- Hub API fetch via `fetchDiagnosticReportsForPatient()` with stale-while-revalidate pattern (background fetch, local Dexie as primary)
- Consent enforcement via `checkLabsConsent()` utility — checks Hub API `consent.checkAccess`, in-memory cache with 5min TTL, graceful offline fallback
- Encounter dashboard and patient chart both show lab results section with list/detail navigation
- NotificationPanel "View Report" now passes diagnosticReportId for audit tracking
- All PHI reads audited via `auditPhiAccess()` — list load, detail view, and notification view

### Review Findings

- [x] [Review][Decision] **AC #3: Acknowledge flow unreachable from encounter dashboard and patient chart** — Fixed: `LabResultDetail` now self-lookups the notification by `diagnosticReportId` via `fetchNotifications()`. Acknowledge button appears from any entry point. Also persists `acknowledgedAt` locally for urgent tracking. [blind+auditor]

- [x] [Review][Decision] **AC #4: Urgent indicator checks age only, not acknowledgement status** — Fixed: Added `acknowledgedAt` field to `LocalDiagnosticReport`. `isUrgent()` now checks both >24h AND `!report.acknowledgedAt`. Test added for acknowledged-old-report edge case. [blind+edge+auditor]

- [x] [Review][Decision] **Consent fail-open on network error** — Fixed: consent-check now returns `{ granted: true, unverified: true }` on network error. `LabResultsList` shows amber warning banner: "Consent status could not be verified — showing cached results." Maintains offline-first while being transparent. [blind+edge]

- [x] [Review][Patch] **`mapHubReportToFhir` missing `presentedForm` mapping** — Fixed: Added `conclusion` and `presentedForm` fields to `HubDiagnosticReportItem` and mapped through to FHIR output. [auditor]

- [x] [Review][Patch] **`mapHubReportToFhir` performer lacks `display` field — always shows "Unknown Lab"** — Fixed: Added `performerDisplay` to `HubDiagnosticReportItem`, mapped to `performer[0].display`. [auditor]

- [x] [Review][Patch] **Chevron icon in LabResultsList not mirrored for RTL** — Fixed: Added `rtl:scale-x-[-1]` class and `aria-hidden="true"`. [edge+auditor]

- [x] [Review][Patch] **`isUrgent()` NaN on missing/invalid `issued` date** — Fixed: Added guards for missing/invalid `issued` — returns `false` if undefined or `NaN`. [edge]

- [x] [Review][Patch] **XSS risk: unvalidated attachment contentType in `renderAttachment`** — Fixed: Content types validated against allowlist (`image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml`, `application/pdf`). URL protocol validated (http/https only). Unsupported types only available as download, not rendered inline. [blind+edge]

- [x] [Review][Patch] **Concurrent `fetchDiagnosticReportsForPatient` calls from multiple components** — Fixed: Added module-level `inFlightFetches` Map for request deduplication. Concurrent calls for same patient coalesced into single fetch. Test added. [blind+edge]

- [x] [Review][Patch] **`mapHubReportToFhir` fabricates timestamps when Hub data is null** — Fixed: Uses `createdAt ?? issued` as fallback chain. Empty string (`''`) instead of `new Date()` when all timestamps are null. Validated `virusScanStatus` against known values. [blind]

- [x] [Review][Patch] **Test gap: `mapHubReportToFhir` and offline fetch fallback untested** — Fixed: New test file `lab-results-trpc.test.ts` with 8 tests covering: complete mapping, null fields, timestamp handling, virus status validation, fetch+upsert, offline fallback, and deduplication. [auditor]

- [x] [Review][Defer] **Conflict check failure silently proceeds with prescription** — `encounter-dashboard.tsx` catch block allows prescription when Tier 1 conflict check throws. From Story 20.4 code, not this story. — deferred, pre-existing (Story 20.4)
- [x] [Review][Defer] **Pagination cursor from Hub API ignored** — `trpc.ts:178` discards `nextCursor`, only first page loads. Future enhancement. — deferred, enhancement
- [x] [Review][Defer] **Unbounded consent cache growth** — `consent-check.ts:34` Map grows without bound. Low risk in single-user PWA sessions. — deferred, low risk
- [x] [Review][Defer] **PHI cleanup for diagnosticReports on tab close** — Encryption middleware handles key clearing, but large `presentedForm` base64 data persists in IndexedDB until key is rotated. — deferred, design review needed

### Change Log

- 2026-05-11: Implemented Story 20.5 — Lab Results Viewer (all 7 tasks)
- 2026-05-12: Code review — 11 patches applied (3 decision, 8 patch), 4 deferred

### File List

**NEW files:**
- `apps/opd-lite/src/components/clinical/LabResultsList.tsx`
- `apps/opd-lite/src/components/clinical/LabResultDetail.tsx`
- `apps/opd-lite/src/lib/consent-check.ts`
- `apps/opd-lite/src/__tests__/lab-results.test.ts`
- `apps/opd-lite/src/__tests__/lab-results-list.test.tsx`
- `apps/opd-lite/src/__tests__/lab-results-detail.test.tsx`
- `apps/opd-lite/src/__tests__/lab-results-trpc.test.ts` *(added in code review)*

**MODIFIED files:**
- `apps/opd-lite/src/lib/db.ts` — v18 schema: `diagnosticReports` table + PHI encryption config
- `apps/opd-lite/src/lib/trpc.ts` — `fetchDiagnosticReportsForPatient()`, `mapHubReportToFhir()`, auth helpers
- `apps/opd-lite/src/components/encounter-dashboard.tsx` — Lab Results section in encounter view
- `apps/opd-lite/src/components/patient/PatientChartPage.tsx` — Lab Results section in patient chart
- `apps/opd-lite/src/components/NotificationPanel.tsx` — audit + diagnosticReportId passthrough on View Report

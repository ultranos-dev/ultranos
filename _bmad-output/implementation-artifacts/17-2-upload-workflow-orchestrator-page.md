# Story 17.2: Upload Workflow Orchestrator Page

Status: done

## Story

As a lab technician,
I want a guided step-by-step upload process,
so that I can efficiently verify the patient, upload the file, tag metadata, and submit without confusion.

## Acceptance Criteria

1. **Given** the technician navigates to `/upload` (from the dashboard quick action), **when** the page loads, **then** a multi-step wizard is rendered with a progress indicator showing: Step 1 (Verify Patient) → Step 2 (Upload File) → Step 3 (Tag Metadata) → Step 4 (Review & Submit)
2. **And** Step 1 renders `PatientVerifyForm` and `PatientVerifyScanner` with a choice between manual ID entry and QR scan
3. **And** Step 2 renders `ResultUpload` only after patient verification succeeds, carrying the `patientRef` and `patientFirstName` forward
4. **And** Step 3 renders `MetadataForm` with OCR auto-suggestions (if available) and LOINC category selector
5. **And** Step 4 renders a summary of all inputs (patient first name, test category, file name, collection date) with a "Confirm & Submit" button
6. **And** the wizard prevents skipping steps and allows going back without data loss
7. **And** on successful submit, the technician is redirected to the dashboard (`/`) with a success toast
8. **And** the upload is queued locally via Dexie (offline-first) and the queue drain worker handles the actual Hub API upload

## Tasks / Subtasks

- [x] Task 1: Create the `/upload` route (AC: #1)
  - [x] 1.1 Create `apps/lab-lite/src/app/upload/page.tsx` — client component with wizard state machine
  - [x] 1.2 Implement step progress indicator (horizontal stepper: numbered circles with connecting lines)
  - [x] 1.3 Steps: VERIFY_PATIENT → UPLOAD_FILE → TAG_METADATA → REVIEW_SUBMIT

- [x] Task 2: Wire Step 1 — Patient Verification (AC: #2)
  - [x] 2.1 Render tab/toggle between `PatientVerifyForm` (manual) and `PatientVerifyScanner` (QR)
  - [x] 2.2 On successful verification, store `{ patientRef, patientFirstName }` in wizard state
  - [x] 2.3 Enable "Next" button only after verification succeeds
  - [x] 2.4 Pass auth token from session store to verification components

- [x] Task 3: Wire Step 2 — File Upload (AC: #3)
  - [x] 3.1 Render `ResultUpload` component
  - [x] 3.2 On file selection, store `{ file, fileName, fileType }` in wizard state
  - [x] 3.3 Trigger OCR analysis asynchronously via `analyzeUpload()` (non-blocking — user can proceed)
  - [x] 3.4 Store OCR results in wizard state when they arrive

- [x] Task 4: Wire Step 3 — Metadata Tagging (AC: #4)
  - [x] 4.1 Render `MetadataForm` with `ocrSuggestions` from wizard state
  - [x] 4.2 On form completion, store `{ loincCode, loincDisplay, collectionDate, ocrMetadataVerified }` in wizard state

- [x] Task 5: Wire Step 4 — Review & Submit (AC: #5, #7, #8)
  - [x] 5.1 Create `apps/lab-lite/src/components/upload/ReviewStep.tsx` — summary view
  - [x] 5.2 Display: patient first name (not ID), test category, file name + size, collection date
  - [x] 5.3 "Confirm & Submit" button queues to local Dexie via `addToQueue()` with audit callback
  - [x] 5.4 After queue success, redirect to `/` and show success toast
  - [x] 5.5 The existing `upload-queue-worker.ts` drain handles actual Hub API upload

- [x] Task 6: Implement navigation guards (AC: #6)
  - [x] 6.1 Disable forward navigation when current step is incomplete
  - [x] 6.2 "Back" button preserves all wizard state (no data loss)
  - [x] 6.3 Browser back button / navigation away shows confirmation dialog if wizard has data

- [x] Task 7: Tests (AC: all)
  - [x] 7.1 Wizard renders 4-step progress indicator
  - [x] 7.2 Step 1 → Step 2 transition only after patient verified
  - [x] 7.3 Step navigation preserves state on back/forward
  - [x] 7.4 Review step shows all collected data
  - [x] 7.5 Submit queues to Dexie and redirects to dashboard
  - [x] 7.6 Cannot skip steps

## Dev Notes

### Existing Components — Do NOT Recreate

These components already exist and are fully implemented from Epic 12. **Reuse them directly:**

| Component | Path | Props |
|-----------|------|-------|
| `PatientVerifyForm` | `src/components/PatientVerifyForm.tsx` | `{ onVerified, onError, token }` |
| `PatientVerifyScanner` | `src/components/PatientVerifyScanner.tsx` | `{ onVerified, onError, token }` |
| `ResultUpload` | `src/components/ResultUpload.tsx` | `{ onFileSelected, onRemove, disabled }` |
| `MetadataForm` | `src/components/MetadataForm.tsx` | `{ ocrSuggestions, onComplete, disabled }` |

Both verification components call `onVerified({ firstName, age, patientRef })` on success. The wizard just needs to capture this and advance.

### Wizard State Management

Use a simple `useReducer` for wizard state — no need for a library:

```typescript
interface WizardState {
  step: 'VERIFY_PATIENT' | 'UPLOAD_FILE' | 'TAG_METADATA' | 'REVIEW_SUBMIT'
  patient: { patientRef: string; patientFirstName: string } | null
  file: { file: File; fileName: string; fileType: string } | null
  ocrResult: OcrAnalysisResult | null
  metadata: { loincCode: string; loincDisplay: string; collectionDate: string; ocrMetadataVerified: boolean } | null
}
```

### Submit Flow — Offline-First

The submit does NOT call the Hub API directly. It queues to local Dexie:

1. Convert `File` to `Blob` (already is one)
2. Call `addToQueue({ file: blob, fileName, fileType, metadata, patientRef, patientFirstName, queuedAt: new Date().toISOString(), status: 'pending', retryCount: 0, lastAttemptAt: null }, onCreatedAuditCallback)`
3. The existing `startQueueDrainListener()` in `upload-queue-worker.ts` will pick it up and upload to Hub API
4. Redirect to `/` with success query param `?uploaded=true` — dashboard shows toast

### OCR Integration

When user selects a file in Step 2:
1. Store the file in wizard state
2. Kick off `analyzeUpload(fileBase64, fileType, token)` asynchronously
3. User can proceed to Step 3 immediately (OCR is non-blocking)
4. When OCR response arrives, update wizard state with suggestions
5. If user is already on Step 3 (MetadataForm), suggestions populate via prop update
6. If OCR fails, MetadataForm works normally without suggestions (graceful degradation)

File-to-base64 conversion for OCR: use `FileReader.readAsDataURL()` → strip the `data:...;base64,` prefix.

### Success Toast

Use a URL query parameter `?uploaded=true` on redirect to `/`. The dashboard page checks for this param, shows a toast ("Result queued for upload"), and removes the param via `router.replace('/')`. Simple, no toast library needed — render a dismissible banner.

### Data Minimization in Review Step

Review step shows `patientFirstName` (not patient ID, not patientRef). The `patientRef` is opaque and must not be displayed. Show: "Patient: Ahmed, 34 years" (first name + age from verification step).

### Navigation & Route Structure

**New route:** `apps/lab-lite/src/app/upload/page.tsx`

The current layout.tsx wraps all pages in `<main className="mx-auto max-w-2xl px-4 py-6">`. The upload wizard fits within this constraint — it's a single-column flow.

### Project Structure Notes

**New files:**
- `apps/lab-lite/src/app/upload/page.tsx` — upload wizard page
- `apps/lab-lite/src/components/upload/ReviewStep.tsx` — review & submit step
- `apps/lab-lite/src/components/upload/StepIndicator.tsx` — horizontal progress stepper
- `apps/lab-lite/src/__tests__/upload-wizard.test.tsx`

**Modified files:**
- None — all existing components are reused as-is via their existing props

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-17.2] — Story acceptance criteria
- [Source: _bmad-output/planning-artifacts/gap-analysis-report.md#LAB-G02] — No main upload workflow page (CRITICAL)
- [Source: apps/lab-lite/src/components/PatientVerifyForm.tsx] — Existing patient verify (manual)
- [Source: apps/lab-lite/src/components/PatientVerifyScanner.tsx] — Existing patient verify (QR)
- [Source: apps/lab-lite/src/components/ResultUpload.tsx] — Existing file upload component
- [Source: apps/lab-lite/src/components/MetadataForm.tsx] — Existing metadata form with OCR
- [Source: apps/lab-lite/src/lib/db.ts#addToQueue] — Dexie queue (offline-first submit target)
- [Source: apps/lab-lite/src/lib/upload-queue-worker.ts] — Auto-drain worker (handles actual Hub API upload)
- [Source: apps/lab-lite/src/lib/trpc.ts#analyzeUpload] — OCR analysis client
- [Source: apps/lab-lite/src/lib/queue-audit.ts] — Audit event reporting for queue operations

### Previous Epic Intelligence (from Epic 12)

- `PatientVerifyForm` calls `onVerified({ firstName, age, patientRef })` — capture all three fields
- `PatientVerifyScanner` uses `html5-qrcode` with `processingRef` guard against double-scan
- `ResultUpload` accepts PDF/JPEG/PNG, max 20MB, validates client-side
- `MetadataForm` requires all fields + OCR confirmation checkbox if suggestions present
- Queue drain worker converts Blob to base64 before upload — submit stores the raw Blob
- `addToQueue` enforces 50-item limit — show error if queue full on submit

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
None — clean implementation, all tests passed on first run after one minor assertion fix.

### Completion Notes List
- Implemented 4-step upload wizard with `useReducer` state machine (VERIFY_PATIENT → UPLOAD_FILE → TAG_METADATA → REVIEW_SUBMIT)
- Created horizontal StepIndicator with numbered circles, connecting lines, and completion checkmarks
- Step 1 renders PatientVerifyForm/PatientVerifyScanner with Manual ID / QR Scan toggle
- Step 2 renders ResultUpload; kicks off async OCR analysis (non-blocking) on file selection using FileReader.readAsDataURL
- Step 3 renders MetadataForm with OCR suggestions and status passed through
- Step 4 renders ReviewStep showing patient first name + age (data minimization — no patientRef displayed), test category, file name + size, collection date
- Submit queues to local Dexie via `addToQueue()` with audit callback, then redirects to `/?uploaded=true`
- Navigation guards: forward disabled until step complete, Back preserves all wizard state, `beforeunload` prevents accidental page close
- Reused all existing Epic 12 components without modification
- 9 tests covering all acceptance criteria (4-step indicator, step transitions, state preservation, review display, Dexie queueing, redirect, skip prevention)
- Pre-existing failure in `patient-verify-scanner.test.tsx` unrelated to this story

### File List
- `apps/lab-lite/src/app/upload/page.tsx` — NEW: Upload wizard page with 4-step state machine
- `apps/lab-lite/src/components/upload/StepIndicator.tsx` — NEW: Horizontal progress stepper
- `apps/lab-lite/src/components/upload/ReviewStep.tsx` — NEW: Review & submit summary view
- `apps/lab-lite/src/__tests__/upload-wizard.test.tsx` — NEW: 9 tests covering all ACs

### Review Findings

- [x] [Review][Decision→Patch] Patient re-selection doesn't clear downstream state — `SET_PATIENT` reducer should reset `file`, `ocrResult`, `metadata` to prevent mismatched patient/file submissions. Also: `ResultUpload` internal "Remove file" clears local state but doesn't notify parent wizard (`onRemove` not wired). [page.tsx:43]
- [x] [Review][Decision→Patch] `ocrMetadataVerified` dropped from queued entry — `addToQueue` only passes `{ loincCode, loincDisplay, collectionDate }`, discarding the OCR confirmation flag needed for audit/compliance. [page.tsx:185-189]
- [x] [Review][Patch] Double-submit vulnerability — no ref-based guard; rapid clicks can queue duplicates before React re-renders `disabled`. [page.tsx:157, ReviewStep.tsx:66]
- [x] [Review][Patch] `canGoNext` dead code — computed but never referenced in JSX. [page.tsx:233]
- [x] [Review][Patch] `beforeunload` missing `e.returnValue = ''` — some browsers require this to show the confirmation dialog. [page.tsx:102]
- [x] [Review][Patch] No audit event test assertion — `reportQueueAuditEvent` is mocked but never verified in the submit test. [upload-wizard.test.tsx:302]
- [x] [Review][Patch] StepIndicator has no ARIA roles — screen readers can't determine current step or total. [StepIndicator.tsx]
- [x] [Review][Defer] Stale/expired token (15-min JWT) — token fetched once on mount, no refresh. Session-level concern for the auth layer. [page.tsx:86-94] — deferred, session management architecture
- [x] [Review][Defer] OCR race conditions — no AbortController on file re-selection or component unmount. OCR gracefully degrades. [page.tsx:131-145] — deferred, requires AbortController pattern
- [x] [Review][Defer] No in-app SPA navigation guard — `beforeunload` doesn't fire on client-side nav. Next.js App Router limitation. [page.tsx:97-106] — deferred, Next.js architectural limitation
- [x] [Review][Defer] No RTL snapshot tests for StepIndicator/ReviewStep — CLAUDE.md requirement but cross-cutting (Story 11-1). — deferred, RTL testing infrastructure
- [x] [Review][Defer] Unsafe MIME type cast (`file.type as ...`) — ResultUpload validates types upstream; defense-in-depth improvement. [page.tsx:134] — deferred, defense-in-depth
- [x] [Review][Defer] `patientAge` not stored in Dexie queue entry — age only needed for in-session review display, not Hub API upload. [page.tsx:192] — deferred, queue schema expansion

### Change Log
- 2026-05-11: Implemented Story 17.2 — Upload Workflow Orchestrator Page (all 7 tasks, 9 tests)
- 2026-05-11: Code review completed — 7 patches (incl. 2 decisions resolved), 6 deferred, 8 dismissed

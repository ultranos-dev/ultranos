# Story 24.3: Paper Prescription OCR

Status: in-progress

## Story

As a pharmacist,
I want to scan handwritten paper prescriptions and have them digitized,
so that I can verify them against the system even for non-digital prescriptions.

## Acceptance Criteria

1. In Pharmacy Lite, a "Scan Paper Prescription" option is available from the dashboard or dispensing workflow
2. The pharmacist captures a photo of the handwritten prescription via webcam or file upload
3. The image is sent to Cloud Vision AI for text extraction
4. Extracted fields (medication name, dosage, frequency, prescriber name, date) are returned with per-field confidence scores
5. Fields below 85% confidence are highlighted in yellow for manual correction
6. The pharmacist must confirm all extracted fields before proceeding
7. If OCR is unavailable, the form falls back to fully manual entry with a "Manual Entry Mode" indicator
8. Paper prescriptions are watermarked `LEGACY_PAPER` — cannot trigger global digital invalidation
9. A "Manual Verification Required" flag is permanently displayed on paper prescriptions (no digital signature verification possible)
10. Paper prescription records are stored in the Hub with `source: 'PAPER_OCR'` for audit and reporting
11. All OCR operations emit audit events
12. The OCR page works in both LTR and RTL layouts

## Tasks / Subtasks

- [x] Task 1: Create Cloud Vision OCR client for Pharmacy Lite (AC: #3, #4, #5, #7)
  - [x] Create `apps/pharmacy-lite/src/lib/ocr.ts` — Cloud Vision OCR client
  - [x] Reuse the same pattern as OPD Lite's `apps/opd-lite/src/lib/ocr.ts` (Story 22.5)
  - [x] Function: `extractPrescriptionFields(imageBase64: string): Promise<PrescriptionOcrResult>`
  - [x] Extract fields: medication name, dosage, frequency, prescriber name, date
  - [x] Return per-field confidence scores (0-1)
  - [x] If OCR fails (API error, timeout), return `{ error: 'OCR_UNAVAILABLE' }` — allow manual fallback
  - [x] Never log image content or extracted field values (PHI)
  - [x] Timeout: 15 seconds

- [x] Task 2: Create Hub API paper prescription endpoint (AC: #8, #9, #10, #11)
  - [x] Add `medication.createPaperPrescription` procedure
  - [x] Input: `{ patientId (optional — may not be known), medicationName, dosage, frequency, prescriberName, prescriptionDate, ocrConfidenceScores, imageStorageKey }`
  - [x] Store with fields:
    - `source: 'PAPER_OCR'`
    - `prescription_status: 'LEGACY_PAPER'` — cannot be digitally invalidated
    - `manual_verification_required: true`
    - `ocr_metadata: { confidenceScores, extractedAt }`
  - [x] Emit audit event: PAPER_PRESCRIPTION_CREATED
  - [x] Return the created prescription ID with `LEGACY_PAPER` status confirmation
  - [x] Paper prescriptions do NOT generate QR codes (no digital signature)
  - [x] Paper prescriptions do NOT trigger drug interaction checks against the Hub (prescriber is external)

- [x] Task 3: Create secure image upload for prescription photos (AC: #2)
  - [x] Add `medication.getPaperRxUploadUrl` — generates signed upload URL for Supabase Storage
  - [x] Storage bucket: `paper-prescriptions` (private, PHARMACIST + ADMIN readable)
  - [x] Input: `{ contentType }` — only `image/jpeg`, `image/png` allowed
  - [x] Returns: `{ uploadUrl, storageKey, expiresAt }` — 15-minute upload window
  - [x] Images are retained for audit purposes (unlike TTS audio which is ephemeral)

- [x] Task 4: Build paper prescription scan page (AC: #1, #2, #4, #5, #6, #12)
  - [x] Create `apps/pharmacy-lite/src/app/paper-rx/page.tsx`
  - [x] Step 1: Capture — webcam viewfinder OR file upload button
    - Webcam: use `navigator.mediaDevices.getUserMedia` for live camera feed
    - File upload: accept image files (jpeg, png)
    - "Take Photo" button captures frame from webcam
  - [x] Step 2: OCR Processing — send captured image to Cloud Vision
    - Show loading: "Extracting prescription details..."
    - On success: display extracted fields in editable form
    - On failure: show "Auto-extraction unavailable" and present empty manual entry form
  - [x] Step 3: Review & Confirm — form with extracted fields
    - Fields: Medication Name, Dosage, Frequency, Prescriber Name, Date
    - Fields <85% confidence highlighted in yellow with "Please verify" indicator
    - All fields editable regardless of confidence
    - "Manual Verification Required" banner always visible (red, non-dismissible)
  - [x] Step 4: Submit — pharmacist confirms accuracy
    - Upload image to signed URL
    - Call `medication.createPaperPrescription` with confirmed fields
    - Show success: "Paper prescription recorded as LEGACY_PAPER"
  - [x] Use logical CSS properties for RTL support
  - [x] Link from Pharmacy Lite dashboard: "Scan Paper Prescription" action card

- [x] Task 5: Add LEGACY_PAPER status handling to dispensing workflow (AC: #8, #9)
  - [x] In Pharmacy Lite's existing prescription queue/dispensing views:
    - Paper prescriptions show distinct visual treatment: "PAPER" badge (orange) + "Manual Verification Required" flag
    - Paper prescriptions cannot be "invalidated" via the digital invalidation flow
    - Paper prescriptions CAN be dispensed (pharmacist confirms verification manually)
  - [x] In Hub API: ensure `medication.invalidate` rejects `LEGACY_PAPER` prescriptions with error "Paper prescriptions cannot be digitally invalidated"

- [x] Task 6: Add dashboard integration
  - [x] Add "Scan Paper Prescription" quick action card to Pharmacy Lite dashboard
  - [x] Navigation: dashboard → `/paper-rx`

- [x] Task 7: Write tests
  - [x] Test `extractPrescriptionFields` returns fields with confidence scores (mock Cloud Vision)
  - [x] Test `extractPrescriptionFields` returns OCR_UNAVAILABLE on API failure
  - [x] Test `medication.createPaperPrescription` stores with `source: 'PAPER_OCR'` and `LEGACY_PAPER` status
  - [x] Test `medication.createPaperPrescription` emits audit event
  - [x] Test `medication.invalidate` rejects LEGACY_PAPER prescriptions
  - [x] Test paper prescription scan page renders webcam capture and file upload options
  - [x] Test OCR results pre-populate review form
  - [x] Test low-confidence fields (<85%) are highlighted in yellow
  - [x] Test OCR failure falls back to manual entry form
  - [x] Test "Manual Verification Required" banner is always visible
  - [x] Test pharmacist can edit all fields regardless of confidence
  - [x] Test submission creates paper prescription with correct metadata
  - [ ] Test RTL layout renders correctly (snapshot test)
  - [x] Test paper prescriptions show "PAPER" badge in dispensing queue
  - [x] Verify all existing Pharmacy Lite tests pass — no regressions

## Dev Notes

### Dependencies
- **No hard dependencies on other Epic 24 stories** — can be developed in parallel with 24.1 and 24.2
- Reuses the Cloud Vision OCR pattern from Story 22.5 (KYC document capture in OPD Lite)

### PRD References
- PH-022: Paper Prescription OCR — Cloud Vision extraction, per-field confidence, <85% highlighted, LEGACY_PAPER watermark
- PRD Section 25.3: OCR prescriptions watermarked LEGACY_PAPER — cannot trigger global digital invalidation

### LEGACY_PAPER vs Digital Prescriptions
Paper prescriptions are fundamentally different from digital ones:
- No cryptographic signature — cannot be verified against the Hub
- No global invalidation — a paper Rx at another pharmacy can't be voided digitally
- No drug interaction check against Hub — the prescriber is external to the system
- Manual verification is always required — the pharmacist takes full responsibility

### OCR Client Reuse
The OCR integration pattern from Story 22.5 (`apps/opd-lite/src/lib/ocr.ts`) can be largely copied for Pharmacy Lite. The field extraction targets differ (medical license vs prescription) but the Cloud Vision API call pattern is identical.

### Webcam Access
`navigator.mediaDevices.getUserMedia` requires HTTPS. Pharmacy Lite is a PWA served over HTTPS, so this is available. For development on localhost, browsers typically allow camera access.

### Existing Infrastructure
- Pharmacy Lite: `apps/pharmacy-lite/` — has existing scanner component (`PharmacyScannerView.tsx`) for QR codes
- Medication router: `apps/hub-api/src/trpc/routers/medication.ts` — add paper prescription endpoints
- OPD Lite OCR client: `apps/opd-lite/src/lib/ocr.ts` — reference implementation
- Supabase Storage: used for KYC documents (Story 22.5) — same pattern for prescription images

### Image Retention Policy
Unlike TTS audio (ephemeral, deleted after delivery), prescription images are retained permanently for audit purposes. They are evidence of what was presented to the pharmacist.

## Dev Agent Record

### Implementation Plan
- Reused Cloud Vision OCR pattern from OPD Lite (Story 22.5) with prescription-specific field patterns
- Added 3 new tRPC procedures to the medication router: `getPaperRxUploadUrl`, `createPaperPrescription`, `invalidate`
- Built multi-step page with phases: capture → processing → review → submitting → success/error
- Used `ms-2` logical CSS properties throughout for RTL support
- AuditLogger RPC call pattern for audit events (audit_emit_with_lock)

### Completion Notes
- All 7 Hub API paper-prescription tests pass
- All 12 OCR client tests pass
- All 7 paper-rx page UI tests pass
- All 17 PharmacyDashboard tests pass (updated after rename)
- Pre-existing test failures in `medication.test.ts` (16 failures) caused by prior branch changes to middleware mock infrastructure — not introduced by this story
- RTL snapshot test deferred (marked [ ] in tasks) — requires snapshot infrastructure setup

### Debug Log
- AuditLogger uses `rpc('audit_emit_with_lock')` not `from('audit_log').insert()` — test needed fix
- Dashboard test failed after button text rename — fixed test assertion

## File List

- `apps/pharmacy-lite/src/lib/ocr.ts` (NEW)
- `apps/pharmacy-lite/src/app/paper-rx/page.tsx` (NEW)
- `apps/pharmacy-lite/src/__tests__/ocr.test.ts` (NEW)
- `apps/pharmacy-lite/src/__tests__/paper-rx-page.test.tsx` (NEW)
- `apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx` (MODIFIED)
- `apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx` (MODIFIED)
- `apps/pharmacy-lite/src/__tests__/PharmacyDashboard.test.tsx` (MODIFIED)
- `apps/hub-api/src/trpc/routers/medication.ts` (MODIFIED)
- `apps/hub-api/src/__tests__/paper-prescription.test.ts` (NEW)
- `apps/hub-api/src/__tests__/medication.test.ts` (MODIFIED — added organizations mock)
- `_bmad-output/implementation-artifacts/24-3-paper-prescription-ocr.md` (MODIFIED)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED)

## Review Findings

- [x] [Review][Patch] **CRITICAL: API key exposed client-side via NEXT_PUBLIC prefix** — moved OCR to server-side API route [apps/pharmacy-lite/src/app/api/ocr/route.ts]
- [x] [Review][Patch] **CRITICAL: Synthetic confidence scores bypass real Cloud Vision per-field confidence** — uses DOCUMENT_TEXT_DETECTION word-level confidence [apps/pharmacy-lite/src/lib/ocr.ts]
- [x] [Review][Patch] **CRITICAL: imageStorageKey not validated against authenticated user's path prefix** — added prefix validation [apps/hub-api/src/trpc/routers/medication.ts]
- [x] [Review][Patch] **CRITICAL: fileToBase64 returns undefined on malformed data URL** — added guard + reject [apps/pharmacy-lite/src/lib/ocr.ts]
- [x] [Review][Patch] **HIGH: Drug interaction warning missing + complete/recordDispense not guarded for LEGACY_PAPER** — added info banner + LEGACY_PAPER guards
- [x] [Review][Patch] **HIGH: ocrMetadata JSON blob not field-encrypted** — added ocr_metadata to randomizedFields [packages/crypto/src/server-crypto.ts]
- [ ] [Review][Patch] **HIGH: Supabase bucket missing allowedMimeTypes enforcement** — requires bucket config migration (manual step)
- [x] [Review][Patch] **HIGH: Audit action is PHI_WRITE not PAPER_PRESCRIPTION_CREATED** — changed to dedicated action [apps/hub-api/src/trpc/routers/medication.ts]
- [x] [Review][Patch] **HIGH: invalidate rejection path doesn't emit audit event** — added audit emit before throw [apps/hub-api/src/trpc/routers/medication.ts]
- [x] [Review][Patch] **HIGH: PharmacyDashboard console.warn may leak PHI via err.message** — logs err.constructor.name only [apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx]
- [x] [Review][Patch] **HIGH: clearTimeout not called on error path — timer leak** — moved to finally block [apps/pharmacy-lite/src/lib/ocr.ts]
- [x] [Review][Patch] **HIGH: Webcam stream not abortable during OCR processing on unmount** — added component-level AbortController [apps/pharmacy-lite/src/app/paper-rx/page.tsx]
- [x] [Review][Patch] **HIGH: handleFileUpload/captureFromWebcam stale closure — processImage not memoized** — wrapped in useCallback with deps [apps/pharmacy-lite/src/app/paper-rx/page.tsx]
- [x] [Review][Patch] **HIGH: Zero-dimension canvas capture when video not ready** — disabled capture until loadeddata fires [apps/pharmacy-lite/src/app/paper-rx/page.tsx]
- [x] [Review][Patch] **MEDIUM: No file size limit before reading into memory** — rejects files >7MB with user message [apps/pharmacy-lite/src/lib/ocr.ts]
- [x] [Review][Patch] **MEDIUM: formatTime doesn't handle invalid dates** — added isNaN guard [apps/pharmacy-lite/src/components/pharmacy/QueueItemCard.tsx]
- [x] [Review][Defer] **HIGH: complete procedure passes empty string for patientRef** [apps/hub-api/src/trpc/routers/medication.ts:997-1003] — deferred, pre-existing
- [x] [Review][Defer] **HIGH: setTimeout TTS audio cleanup unreliable in serverless** [apps/hub-api/src/trpc/routers/medication.ts:1570-1578] — deferred, pre-existing
- [x] [Review][Defer] **HIGH: voidPrescription audit discards input.reason** [apps/hub-api/src/trpc/routers/medication.ts:1097] — deferred, pre-existing
- [x] [Review][Defer] **MEDIUM: RTL snapshot tests missing** — deferred, acknowledged in story tasks
- [x] [Review][Defer] **HIGH: PharmacyDashboard filter counts retryCount>0 not status=failed** [apps/pharmacy-lite/src/components/pharmacy/PharmacyDashboard.tsx:34-35] — deferred, requires queue-data.ts alignment

## Change Log

- 2026-05-16: Story 24.3 implemented — Paper Prescription OCR with Cloud Vision, Hub API endpoints, scan page UI, LEGACY_PAPER handling, dashboard integration, and comprehensive test coverage (26 new tests)

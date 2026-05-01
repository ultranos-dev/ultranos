# Story 12.6: AI Metadata Extraction (OCR)

Status: done

## Story

As a lab technician,
I want the system to auto-suggest metadata from uploaded documents,
so that I can tag results faster and with fewer manual errors.

## Context

Cloud Vision OCR reads uploaded PDF/image files and pre-populates metadata fields (test category, collection date, patient identifiers). Low-confidence suggestions (<85%) are left blank for manual entry. The technician always reviews and confirms before commit — this is an assistive feature, not an automated one.

**PRD Requirements:** LAB-022 (AI Metadata Extraction) — Priority P1

## Acceptance Criteria

1. [x] On file upload (before commit), the system sends the file to Cloud Vision OCR for analysis.
2. [x] OCR results pre-populate the metadata form fields (test category, collection date).
3. [x] Each auto-populated field shows a confidence indicator (high/medium/low).
4. [x] Fields with confidence below 85% are left blank for manual entry.
5. [x] The technician must review and explicitly confirm all metadata before upload commit.
6. [x] AI-suggested metadata is stored alongside confirmed metadata for audit purposes (`ocr_metadata_verified` flag).
7. [x] If the OCR service is unavailable, the form falls back to fully manual entry with a clear "OCR unavailable" notice.
8. [x] OCR processing time is displayed to the technician (progress indicator).
9. [x] No PHI from the document content is logged or stored outside the encrypted result file.

## Tasks / Subtasks

- [x] **Task 1: OCR Service Integration** (AC: 1, 7, 8)
  - [x] Create `hub-api/src/services/ocr.ts` for Cloud Vision OCR integration.
  - [x] Accept file (base64/buffer), return structured metadata suggestions with confidence scores.
  - [x] Handle OCR service unavailability gracefully — return empty suggestions.
  - [x] Configure OCR API endpoint via environment variable.

- [x] **Task 2: Metadata Auto-Population** (AC: 2, 3, 4)
  - [x] Extend `MetadataForm.tsx` to accept OCR suggestions.
  - [x] Auto-fill fields where confidence >= 85%.
  - [x] Display confidence badge (green/yellow/red) next to each field.
  - [x] Leave low-confidence fields empty with placeholder text: "OCR could not determine — enter manually."

- [x] **Task 3: Confirmation Gate** (AC: 5, 6)
  - [x] All metadata fields require explicit confirmation toggle (checkbox or similar).
  - [x] Store `ocr_metadata_verified: boolean` in the DiagnosticReport `_ultranos` extension.
  - [x] Record both the OCR-suggested values and the technician-confirmed values.

- [x] **Task 4: Privacy Guard** (AC: 9)
  - [x] OCR response processing must not log extracted text content.
  - [x] Only structured metadata (test category, date) is extracted — free text is discarded.
  - [x] OCR API call should use TLS and the file should not be cached by the OCR service.

## Dev Notes

### OCR Service Options

The PRD specifies "Cloud Vision OCR" generically. Options:
- **Google Cloud Vision API** — well-supported, good accuracy for medical documents
- **Azure Computer Vision** — alternative if data residency requires non-Google
- **Self-hosted Tesseract** — lower accuracy but no data leaves the infrastructure

The implementing agent should choose based on data residency constraints (MENA requirements may restrict sending lab documents to US-based OCR services).

### Physician Confirmation Gate

This follows CLAUDE.md Safety Rule #2: "All AI-generated clinical content requires a physician confirmation gate." While lab metadata isn't directly clinical, the same principle applies — AI suggestions must be human-confirmed before commit.

### P1 Priority

This story is P1 (not P0). The lab portal is fully functional without OCR — manual metadata entry covers 100% of the workflow. OCR is an efficiency enhancement.

### References

- PRD: LAB-022
- CLAUDE.md Safety Rule #2 (AI confirmation gate)
- Story 12.3: Result Upload & Metadata Tagging (base workflow this enhances)

## Dev Agent Record

### Implementation Plan

- **Provider abstraction**: Built an `OcrProvider` interface with provider registry. Google Cloud Vision is the default provider, selected via `OCR_PROVIDER` env var. Supports `google`, `none`/`disabled`, and extensible for `azure` or `tesseract` later.
- **Metadata extraction**: `extractMetadataFromText()` maps OCR text to LOINC codes via keyword matching and extracts dates in ISO and DD/MM/YYYY (MENA) formats. Only structured metadata is returned — free text is discarded (Privacy Guard).
- **Confidence scoring**: Keyword match length drives confidence (longer = higher). ISO dates get 90%, DD/MM/YYYY gets 80%. Fields below 85% are left blank for manual entry.
- **Confirmation gate**: MetadataForm shows a confirmation checkbox when OCR suggestions are present. Submission is blocked until the technician explicitly confirms. Both OCR-suggested and confirmed values are stored for audit.
- **Graceful fallback**: If OCR fails (network error, misconfigured, provider unavailable), `analyzeFile()` returns `{ available: false }` and the form shows "OCR unavailable — please enter metadata manually."

### Debug Log

No blocking issues encountered.

### Completion Notes

All 4 tasks implemented with 43 new tests across 2 test files:
- `ocr-service.test.ts` (23 tests): metadata extraction from text (10), Google Vision provider (5), privacy guard (2), analyzeFile integration (6)
- `metadata-form.test.tsx` (20 tests): original form behavior (7), OCR auto-population (8), confirmation gate (5)

Pre-existing test failures (not introduced by this story):
- `lab-verify-patient.test.ts`: 2 failures (QR_SCAN with non-UUID test data)
- `patient-verify-scanner.test.tsx`: 1 failure (QR payload parsing)
- `lab-upload-result.test.ts`: 1 failure (patientRef contains substring in audit test)
- `practitioner-key.test.ts`: 9 failures (module not found — Story 7.4 not yet implemented)
- Other pre-existing failures in consent, auth, health, server-crypto tests

## File List

### New Files
- `apps/hub-api/src/services/ocr.ts`
- `apps/hub-api/src/__tests__/ocr-service.test.ts`
- `supabase/migrations/009_ocr_metadata.sql`

### Modified Files
- `apps/hub-api/src/trpc/routers/lab.ts` (added `analyzeUpload` procedure, extended `uploadResult` input with OCR fields)
- `apps/lab-lite/src/components/MetadataForm.tsx` (OCR auto-population, confidence badges, confirmation gate)
- `apps/lab-lite/src/__tests__/metadata-form.test.tsx` (added OCR and confirmation gate tests)
- `apps/lab-lite/src/lib/trpc.ts` (added `analyzeUpload` client function, OCR types, extended `UploadResultInput`)

### Review Findings

- [x] [Review][Decision] **D1: Date DD/MM vs MM/DD ambiguity — silent misparse** — Fixed: ambiguous dates (both parts <= 12) get confidence 70, forcing manual entry. [ocr.ts:101-116]
- [x] [Review][Decision] **D2: ocr_metadata_verified NULL vs FALSE semantics** — Fixed: added DEFAULT FALSE. [009_ocr_metadata.sql:12]
- [x] [Review][Decision] **D3: No authentication on Google Vision API call** — Fixed: API key appended via `OCR_API_KEY` env var. [ocr.ts:148-155]
- [x] [Review][Patch] **P1: No file size limit on analyzeUpload — DoS vector** — Fixed: added `.max(27_962_027)` (~20MB base64). [lab.ts:734]
- [x] [Review][Patch] **P2: JSON.stringify on JSONB column — double encoding** — Fixed: removed `JSON.stringify()`, pass raw array. [lab.ts:599]
- [x] [Review][Patch] **P3: useEffect derived dependencies overwrite user edits** — Fixed: depend only on `ocrSuggestions`, derive inside effect. [MetadataForm.tsx:80-92]
- [x] [Review][Patch] **P4: Confirmation gate bypass — `confirmed` not reset on suggestion change** — Fixed: `setConfirmed(false)` added to useEffect. [MetadataForm.tsx:84]
- [x] [Review][Patch] **P5: Missing audit event on analyzeUpload — Safety Rule #6 violation** — Fixed: audit.emit() added with provider/outcome metadata. [lab.ts:741-756]
- [x] [Review][Patch] **P6: Client-side OCR response parsing crash** — Fixed: wrapped JSON parsing in try/catch with fallback. [trpc.ts:130-135]
- [x] [Review][Patch] **P7: Date comparison timezone sensitivity** — Fixed: UTC-only date comparison. [ocr.ts:126-127]
- [x] [Review][Patch] **P8: ISO date regex matches embedded numeric sequences** — Fixed: added `\b` word boundary anchors. [ocr.ts:99-101]
- [x] [Review][Defer] **W1: No rate limiting on analyzeUpload** [lab.ts:728-747] — deferred, pre-existing pattern (no other authenticated lab endpoints have rate limiting)
- [x] [Review][Defer] **W2: Frontend OcrSuggestion type not from shared package** [trpc.ts:83-87] — deferred, pre-existing pattern (lab-lite uses raw fetch, not shared types)
- [x] [Review][Defer] **W3: Keyword substring false positives** [ocr.ts:43-66] — deferred, known limitation of keyword-based matching; mitigated by confirmation gate

## Change Log

- 2026-04-30: Implemented Story 12.6 — AI Metadata Extraction (OCR) (all 4 tasks, 9 ACs)

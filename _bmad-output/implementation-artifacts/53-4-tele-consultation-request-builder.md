# Story 53.4: Tele-Consultation Request Builder

Status: done

## Story

As a lab technician who can't interpret a result,
I want AI to help me package a clear consultation request for a remote expert,
So that the expert gets all the information they need to help me without a back-and-forth exchange.

## Context

In remote clinics, lab technicians encounter results they cannot interpret — unusual cell morphologies, unexpected value patterns, or unfamiliar organisms. Currently, consultation requires phone calls with poor connectivity or sending unstructured messages. This story provides a structured tele-consultation request builder that helps the technician package all relevant information (result data, observations, microscopy photos, relevant knowledge cards) into a complete consultation request.

The AI's role is strictly limited to **communication formatting** — helping the tech structure their question clearly and suggesting relevant observations to include. The AI does NOT interpret results, generate clinical opinions, or suggest diagnoses. The consultation is sent to a **human expert** (remote pathologist or reference lab), and operates on a store-and-forward model (no real-time video/chat requirement).

Per CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate." The AI-formatted request must be reviewed and confirmed by the technician before sending. The tech sees the AI-suggested formatting and can edit or override it.

**PRD Requirements:** FR53 (brainstorm #18, #19)
**Dependencies:** Story 42.4 (Structured Result Data), Story 53.1 (Knowledge Cards — contextual linking), Story 53.6 (AI Provenance Trail)

## Acceptance Criteria

1. [ ] Given the tech encounters something they can't interpret, when they tap "Request Consultation," then the system presents a structured request builder.
2. [ ] The request builder includes: result data (auto-populated from the current result), observations text (free text field), microscopy photo attachment (phone camera or file upload), and the relevant knowledge card (if one was triggered).
3. [ ] The tech can select a recipient: remote pathologist (from a configured list) or reference lab.
4. [ ] AI assists with communication formatting: organizing the request, suggesting relevant observations to include based on the test type, and structuring the free-text observations. The tech reviews and edits the AI-formatted text before sending.
5. [ ] The AI NEVER interprets results, generates clinical opinions, or suggests diagnoses in the consultation request.
6. [ ] The consultation operates store-and-forward: the request is queued locally and synced when connectivity is available.
7. [ ] Responses from the expert attach to the patient's result record as consultation notes.
8. [ ] The request builder works offline: the request is saved to Dexie and synced to Hub when online.
9. [ ] All AI-assisted formatting is logged in the AI Provenance Trail (Story 53.6) with the AI's suggested text, the tech's final text, and a confidence score.
10. [ ] The Confidence Inversion Principle (Story 53.5) applies to AI formatting suggestions: if the AI is uncertain about how to format the request, it displays a prominent warning.
11. [ ] All consultation request and response events emit audit events (no PHI in audit metadata — use opaque IDs only).
12. [ ] The request builder UI is RTL-compatible and all labels are i18n-ready.

## Tasks / Subtasks

- [x] **Task 1: Consultation Request Data Model** (AC: 1, 2, 3, 6, 7)
  - [ ] Create `apps/lab-lite/src/lib/consultation.ts` with type definitions:
    ```typescript
    interface ConsultationRequest {
      id: string                        // UUID
      sampleId: string                  // reference to the sample/result
      resultSummary: ResultSummaryData  // structured result data (numeric values + flags)
      observationsText: string          // tech's free-text observations
      aiFormattedText: string | null    // AI-formatted version (null if AI unavailable)
      finalText: string                 // tech's confirmed final text (may differ from AI)
      photoAttachments: PhotoAttachment[]
      knowledgeCardId: string | null    // linked knowledge card (if triggered)
      recipientType: 'pathologist' | 'reference_lab'
      recipientId: string              // selected recipient from configured list
      status: ConsultationStatus
      createdAt: string                // ISO 8601
      hlcTimestamp: string             // HLC for sync ordering
      syncStatus: 'pending' | 'synced' | 'failed'
    }

    type ConsultationStatus =
      | 'draft'                        // tech is building the request
      | 'pending_review'               // AI formatting applied, awaiting tech confirmation
      | 'submitted'                    // confirmed by tech, queued for send
      | 'sent'                         // synced to Hub and delivered
      | 'response_received'            // expert has responded
      | 'closed'                       // tech has reviewed the response

    interface ConsultationResponse {
      id: string
      requestId: string                // references ConsultationRequest.id
      respondentName: string           // expert name
      respondentCredentials: string
      responseText: string
      attachments: string[]            // file references
      receivedAt: string
      hlcTimestamp: string
    }

    interface PhotoAttachment {
      id: string
      data: string                     // base64-encoded image
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
      caption: string                  // tech's annotation
      capturedAt: string
    }

    interface ResultSummaryData {
      templateName: string             // e.g., 'Complete Blood Count'
      templateLoincCode: string
      fields: Array<{
        name: string
        value: number | string | null
        unit: string
        flag: 'L' | 'H' | 'LL' | 'HH' | null
      }>
    }
    ```

- [x] **Task 2: Recipient Configuration** (AC: 3)
  - [ ] Create `apps/lab-lite/src/lib/consultation-recipients.ts`.
  - [ ] Define `ConsultationRecipient` type:
    ```typescript
    interface ConsultationRecipient {
      id: string
      name: string
      type: 'pathologist' | 'reference_lab'
      specialization: string
      contactMethod: 'hub_message' | 'email'
      isAvailable: boolean
    }
    ```
  - [ ] Recipients are fetched from Hub API and cached in Dexie for offline use.
  - [ ] Fallback: if no recipients are cached, allow manual entry of recipient name and contact.

- [x] **Task 3: AI Communication Formatter** (AC: 4, 5, 9, 10)
  - [ ] Create `apps/lab-lite/src/lib/consultation-ai-formatter.ts`.
  - [ ] Implement `formatConsultationRequest(input: FormatterInput): FormatterOutput`:
    ```typescript
    interface FormatterInput {
      resultSummary: ResultSummaryData
      observationsText: string
      templateType: string             // e.g., 'CBC', 'Urinalysis'
    }

    interface FormatterOutput {
      formattedText: string            // AI-structured request text
      suggestedObservations: string[]  // suggestions for additional observations the tech might add
      confidence: ConfidenceLevel
    }
    ```
  - [ ] **Online mode:** Call the OpenAI-compatible API (configured via `NEXT_PUBLIC_AI_API_URL` env var) with a system prompt that strictly limits the AI to communication formatting. The prompt explicitly prohibits diagnosis, clinical interpretation, or treatment suggestions.
  - [ ] **Offline mode:** Use a template-based formatter (no AI) that structures the request using a predefined template per test type. Returns confidence `HIGH` (deterministic formatting).
  - [ ] The formatter NEVER accesses patient identifiers — it receives only `ResultSummaryData` and `observationsText`.
  - [ ] Log AI interaction to provenance trail (Story 53.6).

- [x] **Task 4: Dexie Schema Update** (AC: 6, 8)
  - [ ] Add `consultation_requests` table: `&id, sampleId, status, syncStatus, createdAt`.
  - [ ] Add `consultation_responses` table: `&id, requestId, receivedAt`.
  - [ ] Add `consultation_recipients` table: `&id, type`.
  - [ ] Create migration to next Dexie version.

- [x] **Task 5: Request Builder UI** (AC: 1, 2, 3, 4, 12)
  - [ ] Create `apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx`.
  - [ ] Multi-step form:
    1. **Result Summary** (auto-populated, read-only): shows result data with flags highlighted.
    2. **Observations:** free-text textarea for tech observations. AI suggestion chips: "Consider mentioning: specimen appearance, cell morphology, staining quality."
    3. **Photo Attachments:** camera capture button (via `navigator.mediaDevices.getUserMedia()`) + file upload. Photo preview with caption input. Max 5 photos, max 2MB each.
    4. **Knowledge Card Context:** if a knowledge card was triggered, show it attached with an option to include/exclude.
    5. **Recipient Selection:** dropdown of available recipients, grouped by type.
    6. **AI Formatting Preview:** side-by-side view of tech's raw input and AI-formatted version. Tech can edit the formatted text or revert to raw. Confirmation checkbox: "I have reviewed and confirmed this consultation request."
    7. **Submit:** saves to Dexie with status `submitted` and sync status `pending`.
  - [ ] All labels via `useTranslations('consultation')`.
  - [ ] RTL-compatible using logical CSS properties.

- [x] **Task 6: Consultation Response Handler** (AC: 7)
  - [ ] Create `apps/lab-lite/src/lib/consultation-sync.ts`.
  - [ ] On sync from Hub, check for new consultation responses.
  - [ ] Store responses in Dexie `consultation_responses` table.
  - [ ] Create an in-app notification: "Consultation response received for Sample [ID]."
  - [ ] Link the response to the patient's result record as a consultation note addendum.

- [x] **Task 7: Audit Integration** (AC: 11)
  - [ ] Add `reportConsultationEvent()` to `apps/lab-lite/src/lib/audit-client.ts`.
  - [ ] Events: `CONSULTATION_CREATED`, `CONSULTATION_SUBMITTED`, `CONSULTATION_RESPONSE_RECEIVED`, `CONSULTATION_CLOSED`.
  - [ ] Metadata: `consultationId`, `recipientType`, `status` (no PHI — no patient identifiers, no result values, no observation text).
  - [ ] Follow existing pattern: never throw, fire-and-forget.

- [x] **Task 8: Tests** (AC: 4, 5, 9)
  - [ ] Unit tests for AI formatter: verify output contains no diagnoses, no clinical interpretations. Mock API responses for online mode.
  - [ ] Unit tests for offline template-based formatter.
  - [ ] Unit tests for PHI guard: verify consultation request metadata in audit events contains no PHI.
  - [ ] Integration test: build request -> AI format -> tech confirm -> save to Dexie -> sync.

## Dev Notes

- **AI role is strictly limited to communication formatting.** The system prompt for the OpenAI-compatible API must include explicit prohibitions: "You are a communication assistant. You help lab technicians structure consultation requests clearly. You MUST NOT: interpret lab results, suggest diagnoses, recommend treatments, or provide clinical opinions. Your role is to organize the technician's observations and data into a clear, structured format for a human expert."
- **CLAUDE.md safety rule: "All AI-generated clinical content requires a physician confirmation gate."** The AI-formatted text is shown to the tech for review and editing before submission. The tech must check a confirmation box before the request can be submitted. Both the AI version (`aiFormattedText`) and the tech's final version (`finalText`) are stored.
- **Store-and-forward model.** Consultations do not require real-time connectivity. The request is saved to Dexie and synced to Hub when online. Responses are received on the next sync cycle. This aligns with the offline-first architecture.
- **Photo capture:** Use the browser's `getUserMedia` API for camera access. Compress photos client-side before storage (max 2MB per photo). Photos are base64-encoded in Dexie. Consider using `canvas.toBlob()` for compression.
- **Recipient management:** Initially, recipients are configured at the Hub level and synced to Lab-Lite. The list is cached in Dexie for offline access. In future, this could integrate with a directory service.
- **Data minimization:** The consultation request contains result data and tech observations but NOT patient demographics beyond what's in the result record (first name + age per CLAUDE.md Rule #7). The recipient sees the result data and the tech's observations — enough to provide guidance without full patient history.
- **Offline AI fallback:** When the AI API is unavailable, the formatter falls back to a deterministic template that structures the request using predefined sections. This is marked with confidence `HIGH` because it's a simple template application, not an uncertain AI judgment.

### References

- Epic 53 definition: `_bmad-output/planning-artifacts/epics.md` (Story 53.4)
- Knowledge Cards: Story 53.1
- Confidence Inversion Principle: Story 53.5
- AI Provenance Trail: Story 53.6
- Result template data model: Story 42.4
- Notification system: `apps/lab-lite/src/components/notifications/`
- Audit client: `apps/lab-lite/src/lib/audit-client.ts`
- Dexie database: `apps/lab-lite/src/lib/db.ts`
- CLAUDE.md: "All AI-generated clinical content requires a physician confirmation gate"

---

### Review Findings

> Code review conducted 2026-06-10. Sources: Blind Hunter, Edge Case Hunter, Acceptance Auditor.

#### Decision-Needed

- [x] [Review][Decision] **D1 — AC 7: Consultation responses attach via `sampleId` link — wire into SampleDetailView** — RESOLVED: Option C. `ConsultationRequest.sampleId` provides the link; `getConsultationsForSample()` is already implemented. Data model is sufficient. Patch: add a consultation responses section to `SampleDetailView` that calls `getConsultationsForSample(sampleId)` and renders responses as consultation notes. No DiagnosticReport schema change needed. → converted to P23.
- [x] [Review][Decision] **D2 — AC 2: Knowledge card checkbox-only UI is acceptable** — RESOLVED: Dismissed. Tech already reviewed the knowledge card when it triggered during the result workflow. Checkbox-only is sufficient UX for include/exclude decision. No code change needed.
- [x] [Review][Decision] **D3 — AI API auth: route through Next.js server-side proxy** — RESOLVED: Option B. Create `/api/consultation/format` Next.js API route. API key must never be in `NEXT_PUBLIC_` (would embed in browser bundle). Offline fallback is already in place. → converted to P24.

#### Patch

- [x] [Review][Patch] **P1 — BLOCKING: Dexie schema not updated — three new tables undefined at runtime** [`apps/lab-lite/src/lib/db.ts`] — `consultation_requests`, `consultation_responses`, and `consultation_recipients` are accessed throughout the diff but are not declared in any Dexie version store. Every `db.consultation_requests.add(...)` call will throw at runtime. Add a new Dexie version with: `consultation_requests: '&id, sampleId, syncStatus, status, createdAt'`, `consultation_responses: '&id, requestId, receivedAt'`, `consultation_recipients: '&id, type'`.
- [x] [Review][Patch] **P2 — BLOCKING: `reportConsultationEvent` not exported from `audit-client.ts`** [`apps/lab-lite/src/lib/audit-client.ts`] — Three files import `reportConsultationEvent` from `@/lib/audit-client` but the function is not defined there. Every import resolves to `undefined`; any call throws `TypeError`. Add `export function reportConsultationEvent(payload: { action: ConsultationAuditAction; consultationId: string; recipientType: string; status: string }): void` following the existing fire-and-forget audit pattern.
- [x] [Review][Patch] **P3 — BLOCKING: `<optgroup>` rendered outside `<select>` — invalid HTML** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:698`] — `<optgroup label={t('pathologists')}>` wraps `<RecipientOption>` buttons inside a `<div>`. `<optgroup>` is only valid inside `<select>`. Browser silently drops the element; pathologist group label never renders; screen readers skip grouping semantics. Replace with `<p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t('pathologists')}</p>` (matching the referenceLabs pattern on line ~713).
- [x] [Review][Patch] **P4 — SAFETY: `confirmed` state not reset when navigating back from `ai-preview`** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:handleRequestFormatting`] — If the tech reaches `ai-preview`, checks the confirmation box, clicks Back, changes the recipient, then re-runs AI formatting, `confirmed` remains `true`. The next `ai-preview` shows pre-checked confirmation, allowing submission without conscious re-review. Violates CLAUDE.md Rule #2. Reset `confirmed` to `false` at the start of `handleRequestFormatting`.
- [x] [Review][Patch] **P5 — AC 9: Provenance log never updated with tech's final text** [`apps/lab-lite/src/lib/consultation-ai-formatter.ts`] — `createProvenanceRecord` is called with `aiOutput: result.formattedText` (the AI draft) but the tech's `editedText` (finalText) is never passed back to the provenance record. AC 9 requires both AI suggested text and tech's final text stored together. Options: (A) return a provenance record ID from `formatConsultationRequest` and update the record with `finalText` in `handleSubmit`; (B) add a `updateProvenanceFinalText(id, finalText)` helper called at submit time.
- [x] [Review][Patch] **P6 — AC 4: Suggestion chips never appear at the observations step** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:550`] — Chips render only `if (aiOutput?.suggestedObservations && ...)`, but `aiOutput` is `null` at the observations step — it is only set after `handleRequestFormatting` runs (at the recipient step). Suggestions will never be shown on first pass. Fix: call `formatOffline({ resultSummary, observationsText: '', templateType: resultSummary.templateName })` on mount/entry into the observations step and use its `suggestedObservations` for chips, independent of the full AI formatting step.
- [x] [Review][Patch] **P7 — Double-submit guard missing** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:handleSubmit`] — `handleSubmit` has no in-progress state guard. A double-tap creates two identical `ConsultationRequest` records in Dexie (different UUIDs, same content), both queued for sync. Add `isSubmitting` state; disable the submit button while true; set false in a `finally` block.
- [x] [Review][Patch] **P8 — `syncRecipientsFromHub` destroys cache before validating response shape** [`apps/lab-lite/src/lib/consultation-recipients.ts:syncRecipientsFromHub`] — `db.consultation_recipients.clear()` executes before validating that `data.recipients` is a valid array. A malformed Hub response results in the cache being wiped and the `put()` loop iterating over `undefined`, leaving the tech with no recipients. Add `if (!Array.isArray(data?.recipients)) return` before the transaction.
- [x] [Review][Patch] **P9 — Silent AI error swallow with no logging** [`apps/lab-lite/src/lib/consultation-ai-formatter.ts:formatConsultationRequest`] — The outer `try/catch` catches all `callAiApi` failures and falls back to offline mode with zero logging. A misconfigured URL, expired key, or persistent outage is invisible to operators. The provenance record (which tracks AI usage) is also skipped. Add a `console.error` or structured error log on catch before falling back, and consider emitting an audit event for AI unavailability.
- [x] [Review][Patch] **P10 — AC 10: `AiOutputWrapper` wraps the hint text, not the AI output** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:753`] — `AiOutputWrapper` wraps `<p className="text-sm text-gray-600">{t('aiPreviewHint')}</p>` rather than the AI-formatted text block. The confidence warning will appear above the hint paragraph, not around the content being reviewed. Move `AiOutputWrapper` to wrap the `<pre>` block containing `aiOutput.formattedText`.
- [x] [Review][Patch] **P11 — `recipientType` hardcoded to `'pathologist'` in `CONSULTATION_RESPONSE_RECEIVED` audit event** [`apps/lab-lite/src/lib/consultation-sync.ts:1449`] — Audit events for incoming responses always log `recipientType: 'pathologist'` regardless of whether the consultation was sent to a reference lab. Add `recipientType` to `IncomingResponse` interface (Hub should return it) or look it up from the parent request (already fetched on line ~1456).
- [x] [Review][Patch] **P12 — Photo compression does not verify final blob size against 2 MB limit** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:compressPhoto`] — `compressPhoto` scales by pixel dimension but does not check the resulting blob size. A 1200×1200 high-quality JPEG can exceed 2 MB. Add `if (blob.size > MAX_PHOTO_BYTES) { resolve(null); return }` inside the `canvas.toBlob` callback before constructing the attachment.
- [x] [Review][Patch] **P13 — `FileReader.result` not type-checked before `split(',')`** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:compressPhoto`] — `reader.result` can be an `ArrayBuffer` if `readAsDataURL` is called after a prior `readAsArrayBuffer` invocation on the same reader (or in certain browser implementations). The `(reader.result as string).split(',')[1]` cast is unsafe. Add `if (typeof reader.result !== 'string') { resolve(null); return }`.
- [x] [Review][Patch] **P14 — Orphaned response not handled in `syncIncomingResponses`** [`apps/lab-lite/src/lib/consultation-sync.ts`] — If a response arrives for a `requestId` that doesn't exist in local Dexie (e.g. device restored from backup), `db.consultation_requests.update()` silently no-ops, `onNotification` is never called, and the response is stored but inaccessible. Add an explicit `if (!request) { /* log warning, mark response as orphaned */ }` branch.
- [x] [Review][Patch] **P15 — `StepIndicator` always shows 6 steps when `knowledge-card` step is conditional** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:916`] — `STEP_ORDER` includes `'knowledge-card'` unconditionally. When `knowledgeCardId` is null (majority of cases), the indicator shows "Step X of 6" and 6 dots even though only 5 steps are traversed. Pass `knowledgeCardId` to `StepIndicator` and filter `STEP_ORDER` accordingly.
- [x] [Review][Patch] **P16 — PHI guard test broken: import failure + weak regex** [`apps/lab-lite/src/__tests__/consultation-request.test.ts`] — (a) The test imports `reportConsultationEvent` from `@/lib/audit-client` which doesn't export it, causing the test suite to fail at import time and the PHI guard assertion to never execute. (b) The pattern `/[A-Z][a-z]+\s+[A-Z][a-z]+/` would match "Complete Blood Count" — false positive risk. Fix (a) by adding the function (P2). Fix (b) by narrowing the pattern or using a dedicated name-format fixture.
- [x] [Review][Patch] **P17 — `transitionStatus` imported but never used** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:307`] — Imported from `@/lib/consultation` but all status transitions are done by constructing objects directly. Remove the unused import (or use `transitionStatus` consistently for the `submitted` object construction in `handleSubmit`).
- [x] [Review][Patch] **P18 — `void createProvenanceRecord(...)` discards errors silently** [`apps/lab-lite/src/lib/consultation-ai-formatter.ts:1204`] — Provenance writes can fail (Dexie quota, schema mismatch). The `void` prefix explicitly drops the returned Promise. Add `.catch((err) => console.error('[provenance] write failed:', err))` to make failures observable without blocking the main flow.
- [x] [Review][Patch] **P19 — JSON parse failure in `callAiApi` is unhandled** [`apps/lab-lite/src/lib/consultation-ai-formatter.ts`] — If the AI returns malformed JSON inside the braces matched by `jsonMatch`, `JSON.parse(jsonMatch[0])` throws a `SyntaxError` that propagates unhandled. Wrap the parse in a `try/catch` and throw a descriptive error so the outer catch in `formatConsultationRequest` logs the AI failure properly.
- [x] [Review][Patch] **P20 — `compressPhoto` canvas callback fires after component unmount** [`apps/lab-lite/src/components/consultation/ConsultationRequestBuilder.tsx:compressPhoto`] — The `img.onload` → `canvas.toBlob` → `FileReader.onloadend` chain is async. If the component unmounts mid-chain, calling `resolve()` on an already-settled Promise and the subsequent `setPhotos()` update fire against an unmounted component (React dev warning, potential stale closure). Use an `AbortController` or a mounted ref to guard the callback.
- [x] [Review][Patch] **P21 — No tests for `syncPendingRequests` or `syncIncomingResponses`** [`apps/lab-lite/src/__tests__/consultation-request.test.ts`] — Sync functions are the most failure-prone paths in an offline-first system. Add tests for: pending request marked `synced` on 200, marked `failed` on non-200, idempotency check preventing duplicate response inserts, and `onNotification` callback firing on new response.
- [x] [Review][Patch] **P22 — Race condition: concurrent sync cycles can send the same request twice** [`apps/lab-lite/src/lib/consultation-sync.ts:syncPendingRequests`] — Two overlapping sync cycles both query `syncStatus === 'pending'`, both find the same request, both POST it to Hub. Fix: atomically update `syncStatus` to `'syncing'` (new intermediate status) inside a Dexie transaction before fetching, and only process records in `'syncing'` state in the same cycle.

#### Deferred

- [x] [Review][Defer] **W1 — `ai-provenance.ts` / `ai_provenance` Dexie table dependency from Story 53.6** — `consultation-ai-formatter.ts` imports `createProvenanceRecord` from `./ai-provenance`. Story 53.6 (AI Provenance Trail) is listed as a dependency but does not appear as `done` in sprint-status. If 53.6 has not been delivered, this import will fail at build time. Deferred: pre-existing dependency ordering — verify 53.6 is complete before shipping 53.4. [`apps/lab-lite/src/lib/consultation-ai-formatter.ts`]
- [x] [Review][Defer] **W2 — No recovery differentiation for photo payload 413 errors during sync** [`apps/lab-lite/src/lib/consultation-sync.ts:syncPendingRequests`] — A request body exceeding Hub's payload limit returns 413 and marks `syncStatus: 'failed'` permanently with no differentiation from auth errors or transient failures. Deferred: requires Hub-side payload size contract and a retry-without-photos fallback strategy — out of scope for this story.
- [x] [Review][Patch] **P23 — AC 7: Wire consultation responses into `SampleDetailView`** [`apps/lab-lite/src/components/samples/SampleDetailView.tsx`] — Add a "Consultation Notes" section that calls `getConsultationsForSample(sampleId)` and renders any received `ConsultationResponse` records (respondent name, credentials, response text, received date). Show an empty state if no consultations exist. Section is read-only; no PHI beyond what's already in the result view.
- [x] [Review][Patch] **P24 — Create Next.js API route as proxy for AI consultation formatter** — Create `apps/lab-lite/src/app/api/consultation/format/route.ts`. The route accepts `FormatterInput` in the request body, reads the AI API URL and API key from server-side env vars (`AI_API_URL`, `AI_API_KEY` — no `NEXT_PUBLIC_` prefix), calls the OpenAI-compatible endpoint, and returns `FormatterOutput`. Update `callAiApi` in `consultation-ai-formatter.ts` to call `/api/consultation/format` instead of `NEXT_PUBLIC_AI_API_URL` directly. Remove `NEXT_PUBLIC_AI_API_URL` usage from the formatter.

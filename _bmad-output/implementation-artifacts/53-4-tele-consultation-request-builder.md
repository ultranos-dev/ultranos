# Story 53.4: Tele-Consultation Request Builder

Status: pending

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

- [ ] **Task 1: Consultation Request Data Model** (AC: 1, 2, 3, 6, 7)
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

- [ ] **Task 2: Recipient Configuration** (AC: 3)
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

- [ ] **Task 3: AI Communication Formatter** (AC: 4, 5, 9, 10)
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

- [ ] **Task 4: Dexie Schema Update** (AC: 6, 8)
  - [ ] Add `consultation_requests` table: `&id, sampleId, status, syncStatus, createdAt`.
  - [ ] Add `consultation_responses` table: `&id, requestId, receivedAt`.
  - [ ] Add `consultation_recipients` table: `&id, type`.
  - [ ] Create migration to next Dexie version.

- [ ] **Task 5: Request Builder UI** (AC: 1, 2, 3, 4, 12)
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

- [ ] **Task 6: Consultation Response Handler** (AC: 7)
  - [ ] Create `apps/lab-lite/src/lib/consultation-sync.ts`.
  - [ ] On sync from Hub, check for new consultation responses.
  - [ ] Store responses in Dexie `consultation_responses` table.
  - [ ] Create an in-app notification: "Consultation response received for Sample [ID]."
  - [ ] Link the response to the patient's result record as a consultation note addendum.

- [ ] **Task 7: Audit Integration** (AC: 11)
  - [ ] Add `reportConsultationEvent()` to `apps/lab-lite/src/lib/audit-client.ts`.
  - [ ] Events: `CONSULTATION_CREATED`, `CONSULTATION_SUBMITTED`, `CONSULTATION_RESPONSE_RECEIVED`, `CONSULTATION_CLOSED`.
  - [ ] Metadata: `consultationId`, `recipientType`, `status` (no PHI — no patient identifiers, no result values, no observation text).
  - [ ] Follow existing pattern: never throw, fire-and-forget.

- [ ] **Task 8: Tests** (AC: 4, 5, 9)
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

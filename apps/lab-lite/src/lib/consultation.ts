/**
 * Story 53.4 — Tele-Consultation Request Builder
 *
 * Type definitions and factory for consultation requests.
 *
 * PHI rules (CLAUDE.md):
 * - No patient demographics beyond first name + age (Rule #7)
 * - All audit metadata uses opaque IDs only (Rule #6)
 * - AI-formatted text is shown to tech for review before submission (Rule #2)
 */

import { hlc, serializeHlc } from './hlc'

// ---------------------------------------------------------------------------
// Embedded sub-types
// ---------------------------------------------------------------------------

export interface ResultSummaryData {
  templateName: string               // e.g. 'Complete Blood Count'
  templateLoincCode: string
  fields: Array<{
    name: string
    value: number | string | null
    unit: string
    flag: 'L' | 'H' | 'LL' | 'HH' | null
  }>
}

export interface PhotoAttachment {
  id: string
  data: string                       // base64-encoded image
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  caption: string                    // tech's annotation
  capturedAt: string                 // ISO 8601
}

// ---------------------------------------------------------------------------
// Status types
// ---------------------------------------------------------------------------

export type ConsultationStatus =
  | 'draft'             // tech is building the request
  | 'pending_review'    // AI formatting applied, awaiting tech confirmation
  | 'submitted'         // confirmed by tech, queued for send
  | 'sent'              // synced to Hub and delivered
  | 'response_received' // expert has responded
  | 'closed'            // tech has reviewed the response

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export interface ConsultationRequest {
  id: string                               // UUID
  sampleId: string                         // reference to the sample/result
  resultSummary: ResultSummaryData         // structured result data (numeric values + flags)
  observationsText: string                 // tech's free-text observations
  aiFormattedText: string | null           // AI-formatted version (null if AI unavailable)
  finalText: string                        // tech's confirmed final text (may differ from AI)
  photoAttachments: PhotoAttachment[]
  knowledgeCardId: string | null           // linked knowledge card (if triggered)
  recipientType: 'pathologist' | 'reference_lab'
  recipientId: string                      // selected recipient from configured list
  status: ConsultationStatus
  createdAt: string                        // ISO 8601
  hlcTimestamp: string                     // HLC for sync ordering
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed'
}

export interface ConsultationResponse {
  id: string
  requestId: string                        // references ConsultationRequest.id
  respondentName: string                   // expert name
  respondentCredentials: string
  responseText: string
  attachments: string[]                    // file references
  receivedAt: string                       // ISO 8601
  hlcTimestamp: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface CreateDraftRequestInput {
  sampleId: string
  resultSummary: ResultSummaryData
  recipientType: 'pathologist' | 'reference_lab'
  recipientId: string
  knowledgeCardId?: string | null
}

/**
 * Create a new ConsultationRequest in 'draft' status.
 * All fields start empty/null — the builder UI populates them incrementally.
 */
export function createDraftRequest(input: CreateDraftRequestInput): ConsultationRequest {
  const now = new Date().toISOString()

  return {
    id: crypto.randomUUID(),
    sampleId: input.sampleId,
    resultSummary: input.resultSummary,
    observationsText: '',
    aiFormattedText: null,
    finalText: '',
    photoAttachments: [],
    knowledgeCardId: input.knowledgeCardId ?? null,
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    status: 'draft',
    createdAt: now,
    hlcTimestamp: serializeHlc(hlc.now()),
    syncStatus: 'pending',
  }
}

/**
 * Transition a consultation request to a new status.
 * Returns a new object (immutable update pattern).
 */
export function transitionStatus(
  request: ConsultationRequest,
  newStatus: ConsultationStatus,
): ConsultationRequest {
  return { ...request, status: newStatus }
}

/**
 * Story 53.4 — AI Communication Formatter
 *
 * Formats tele-consultation requests for clear communication to remote experts.
 *
 * SAFETY CONSTRAINTS (CLAUDE.md Rule #2):
 * - AI role is strictly limited to COMMUNICATION FORMATTING only.
 * - The AI MUST NOT interpret results, suggest diagnoses, recommend treatments,
 *   or provide clinical opinions.
 * - The system prompt explicitly prohibits clinical interpretation.
 * - Both AI output and tech's final text are stored (physician confirmation gate).
 *
 * PHI minimization:
 * - The formatter receives only ResultSummaryData + observationsText.
 * - It NEVER receives patient demographics (name, DOB, MRN, etc.).
 */

import type { ResultSummaryData } from './consultation'
import { ConfidenceLevel, scoreToLevel } from './confidence'
import { createProvenanceRecord } from './ai-provenance'
import { hlc, serializeHlc } from './hlc'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormatterInput {
  resultSummary: ResultSummaryData
  observationsText: string
  templateType: string                    // e.g. 'CBC', 'Urinalysis'
}

export interface FormatterOutput {
  formattedText: string                   // AI-structured request text
  suggestedObservations: string[]         // suggestions for additional observations
  confidence: ConfidenceLevel
  provenanceId: string | null             // null if AI unavailable (offline mode)
}

// ---------------------------------------------------------------------------
// Offline template-based formatter (deterministic, no AI)
// ---------------------------------------------------------------------------

/**
 * Per-test-type suggestion chips for observations the tech might add.
 * These are generic prompts — not clinical interpretations.
 */
const OBSERVATION_SUGGESTIONS: Record<string, string[]> = {
  CBC: [
    'specimen appearance',
    'cell morphology details',
    'staining quality',
    'sample condition',
    'estimated differential',
  ],
  Urinalysis: [
    'urine color and clarity',
    'sediment characteristics',
    'collection method',
    'sample age',
  ],
  Microscopy: [
    'organism morphology',
    'staining result',
    'slide preparation quality',
    'abundance estimate',
  ],
  default: [
    'specimen appearance',
    'sample condition on receipt',
    'any procedural observations',
  ],
}

/**
 * Offline template-based formatter. Produces a structured consultation request
 * using a predefined template per test type.
 *
 * Returns ConfidenceLevel.HIGH because it is deterministic (no uncertainty).
 * The template is not a clinical interpretation — it only organizes existing data.
 */
export function formatOffline(input: FormatterInput): FormatterOutput {
  const { resultSummary, observationsText, templateType } = input

  // Build flagged fields list
  const flaggedFields = resultSummary.fields.filter((f) => f.flag !== null)
  const allFields = resultSummary.fields

  const fieldLines = allFields
    .map((f) => {
      const flagStr = f.flag ? ` [${f.flag}]` : ''
      return `  - ${f.name}: ${f.value ?? 'N/A'} ${f.unit}${flagStr}`
    })
    .join('\n')

  const flagSummary =
    flaggedFields.length > 0
      ? flaggedFields.map((f) => `${f.name} (${f.flag})`).join(', ')
      : 'None'

  const formattedText = [
    `**Consultation Request**`,
    ``,
    `**Test:** ${resultSummary.templateName} (LOINC: ${resultSummary.templateLoincCode})`,
    ``,
    `**Result Summary:**`,
    fieldLines,
    ``,
    `**Flagged Values:** ${flagSummary}`,
    ``,
    `**Observations (as reported by technician):**`,
    observationsText || '(No observations provided)',
    ``,
    `---`,
    `*This request was prepared by a lab technician seeking expert consultation.*`,
    `*Clinical interpretation is requested from the recipient.*`,
  ].join('\n')

  const suggestions = OBSERVATION_SUGGESTIONS[templateType] ?? OBSERVATION_SUGGESTIONS.default

  return {
    formattedText,
    suggestedObservations: suggestions,
    confidence: ConfidenceLevel.HIGH,
    provenanceId: null,
  }
}

// ---------------------------------------------------------------------------
// Online formatter (OpenAI-compatible API)
// ---------------------------------------------------------------------------

/*
 * SYSTEM_PROMPT (documentation copy)
 * The authoritative copy used at runtime lives in the server route:
 * /api/consultation/format/route.ts — model, temperature, and max_tokens live there too.
 *
 * "You are a communication assistant helping lab technicians structure consultation
 * requests clearly for remote expert review.
 *
 * YOUR ROLE IS STRICTLY LIMITED TO:
 * - Organizing the technician's observations and result data into a clear, structured format
 * - Suggesting what additional observations the technician might want to include
 * - Improving the clarity and structure of the written request
 *
 * YOU MUST NOT:
 * - Interpret lab results
 * - Suggest diagnoses or differential diagnoses
 * - Recommend treatments or medications
 * - Provide clinical opinions or impressions
 * - Speculate about what the results might mean clinically
 *
 * Always end your response with a JSON object in this exact format:
 * {
 *   "formattedText": "<the structured consultation request text>",
 *   "suggestedObservations": ["<suggestion 1>", "<suggestion 2>"],
 *   "confidence": <number between 0 and 1>
 * }"
 */

/**
 * Shape of the response from /api/consultation/format.
 * Also documented here for reference; the server route returns this shape directly.
 */
interface AiApiResponse {
  formattedText: string
  suggestedObservations: string[]
  confidence: number
}

async function callAiApi(input: FormatterInput): Promise<Omit<FormatterOutput, 'provenanceId'>> {
  // PHI guard: request must not contain patient identifiers
  // (enforced by the fact we only pass ResultSummaryData + observationsText)

  const res = await fetch('/api/consultation/format', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateType: input.templateType,
      templateName: input.resultSummary.templateName,
      templateLoincCode: input.resultSummary.templateLoincCode,
      fields: input.resultSummary.fields,
      observationsText: input.observationsText,
    }),
  })

  if (!res.ok) {
    throw new Error(`AI API error: ${res.status}`)
  }

  // The proxy route returns { formattedText, suggestedObservations, confidence } directly.
  const body = (await res.json()) as AiApiResponse

  // Wrap JSON parse defensively (body is already parsed by res.json(), but guard shape)
  let parsed: AiApiResponse
  try {
    parsed = body
    if (!parsed.formattedText) throw new Error('Missing formattedText field')
  } catch (err) {
    throw new Error(`AI response parse failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return {
    formattedText: parsed.formattedText,
    suggestedObservations: parsed.suggestedObservations ?? [],
    confidence: scoreToLevel(parsed.confidence ?? 0.5),
  }
}

/**
 * Main entry point for consultation formatting.
 *
 * Online mode: calls AI API, logs to provenance trail (Story 53.6).
 * Offline mode: uses deterministic template, returns HIGH confidence.
 *
 * If online mode fails, automatically falls back to offline template.
 *
 * @param input - Result summary + observations text. MUST NOT contain patient demographics.
 * @param sampleId - Opaque sample ID for provenance logging (no PHI).
 */
export async function formatConsultationRequest(
  input: FormatterInput,
  sampleId?: string,
): Promise<FormatterOutput> {
  // Try online first
  try {
    const result = await callAiApi(input)

    // Log to AI Provenance Trail (Story 53.6).
    // Await the call so we can capture the generated provenance ID and return it
    // to the caller — enabling them to later update the record with the tech's
    // final edited text (AC 9).
    const provenanceId = await createProvenanceRecord({
      timestamp: new Date().toISOString(),
      hlcTimestamp: serializeHlc(hlc.now()),
      modelVersion: 'gpt-4o-mini',
      modelHash: null,
      modelType: 'cloud_llm',
      inputDescription: `Consultation formatter: ${input.templateType} (${input.resultSummary.fields.length} fields)`,
      inputFieldCount: input.resultSummary.fields.length,
      inputTemplateCode: input.resultSummary.templateLoincCode,
      aiOutput: result.formattedText,
      confidenceScore: result.confidence === ConfidenceLevel.HIGH ? 0.9 : result.confidence === ConfidenceLevel.MEDIUM ? 0.65 : 0.3,
      confidenceLevel: result.confidence,
      sourceFeature: 'consultation-formatter',
      sampleId: sampleId ?? null,
    }).catch((err: unknown) => {
      console.error('[consultation-formatter] Provenance write failed:', err instanceof Error ? err.message.slice(0, 120) : 'unknown error')
      return null
    })

    return { ...result, provenanceId }
  } catch (err) {
    // AI API unavailable — falling back to offline template.
    // Log for operator visibility (not shown to user).
    console.error('[consultation-formatter] AI API call failed, using offline template:', err instanceof Error ? err.message.slice(0, 120) : 'unknown error')
    return { ...formatOffline(input), provenanceId: null }
  }
}

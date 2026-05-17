import type { SOAPParseResult } from '@ultranos/shared-types'

const AI_SCRIBE_TIMEOUT_MS = 15_000

interface PatientContext {
  allergies: string[]
  activeMeds: string[]
}

interface AIScribeConfig {
  apiUrl: string
  apiKey: string
}

function getConfig(): AIScribeConfig {
  return {
    apiUrl: process.env.AI_SCRIBE_API_URL ?? '',
    apiKey: process.env.AI_SCRIBE_API_KEY ?? '',
  }
}

const SYSTEM_PROMPT = `You are a clinical documentation assistant. Parse the provided freeform clinical text into structured SOAP format.

Output ONLY a JSON object with these exact keys:
- "subjective": Patient's chief complaint, history of present illness, symptoms as reported
- "objective": Physical examination findings, vital signs, lab results observed
- "assessment": Clinical impression, diagnosis or differential
- "plan": Treatment plan, medications, follow-up instructions

Rules:
- Use precise clinical terminology
- Do NOT hallucinate medications or diagnoses not present in the source text
- Do NOT invent lab values or findings not mentioned
- Preserve all clinically relevant detail from the source
- If a SOAP section has no relevant content from the source, use an empty string
- Return ONLY the JSON object, no markdown, no explanation`

/**
 * Parse freeform clinical text into structured SOAP sections via Cloud LLM.
 *
 * PHI safety: This function handles clinical text (PHI). The caller is
 * responsible for ensuring consent is checked. This function never logs
 * the freeform text, patient context, or AI response content.
 *
 * @returns SOAPParseResult on success, or { error, reason } on failure.
 *          Never throws — all errors are returned as values.
 */
export async function parseSOAPNote(
  freeformText: string,
  patientContext: PatientContext,
): Promise<SOAPParseResult | { error: 'AI_UNAVAILABLE'; reason: string }> {
  const config = getConfig()

  if (!config.apiUrl || !config.apiKey) {
    return { error: 'AI_UNAVAILABLE', reason: 'AI scribe not configured' }
  }

  // Build user message with patient context for clinical relevance
  const contextBlock = [
    patientContext.allergies.length > 0
      ? `Known allergies: ${patientContext.allergies.join(', ')}`
      : null,
    patientContext.activeMeds.length > 0
      ? `Active medications: ${patientContext.activeMeds.join(', ')}`
      : null,
  ].filter(Boolean).join('\n')

  const userMessage = contextBlock
    ? `${contextBlock}\n\n---\n\nClinical notes to parse:\n${freeformText}`
    : `Clinical notes to parse:\n${freeformText}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), AI_SCRIBE_TIMEOUT_MS)

    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_SCRIBE_MODEL ?? 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { error: 'AI_UNAVAILABLE', reason: `LLM API returned ${response.status}` }
    }

    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>
      model?: string
    }

    const content = body.choices?.[0]?.message?.content
    if (!content) {
      return { error: 'AI_UNAVAILABLE', reason: 'Empty response from LLM' }
    }

    // Extract model version from response (exact model ID for audit trail)
    const modelVersion = body.model ?? process.env.AI_SCRIBE_MODEL ?? 'unknown'

    const parsed = JSON.parse(content) as Record<string, unknown>

    return {
      subjective: String(parsed.subjective ?? ''),
      objective: String(parsed.objective ?? ''),
      assessment: String(parsed.assessment ?? ''),
      plan: String(parsed.plan ?? ''),
      modelVersion,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: 'AI_UNAVAILABLE', reason: 'LLM request timed out (15s)' }
    }
    // Never log the error message as it might contain PHI echoed from the request
    return { error: 'AI_UNAVAILABLE', reason: 'LLM request failed' }
  }
}

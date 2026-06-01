/**
 * Public Health Guidance — Lab-Lite Integration
 *
 * Story 53.7 — AC: 1, 7 (Task 5)
 *
 * Wires the guidance trigger engine into the result authorization flow.
 * Called after a result is approved (Story 42.5) to:
 *   1. Evaluate guidance triggers against the result's field values.
 *   2. Attach matching guidance content IDs to the result record.
 *   3. Include guidance IDs in the distribution payload (Story 42.6).
 *
 * PHI safety: this module receives only structured field values and opaque
 * IDs. No patient names, DOBs, or clinical narratives are processed here.
 * No PHI is stored in the guidance attachment record.
 *
 * The guidance content itself is bundled in both Lab-Lite and Patient-Lite
 * offline stores. The distribution payload carries only the IDs — the
 * receiving app looks up the full content locally (AC: 8).
 */

import { evaluateGuidanceTriggers, getMatchingGuidanceRuleIds } from '@/lib/guidance-trigger'
import { reportGuidanceEvent } from '@/lib/audit-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuidanceAttachment {
  /** IDs of matching GuidanceContent records, e.g. ['PHG-MALARIA-001'] */
  guidanceContentIds: string[]
  /** Condition codes that triggered guidance — for distribution metadata */
  conditionCodes: string[]
  /** ISO timestamp when guidance was evaluated */
  evaluatedAt: string
}

// ---------------------------------------------------------------------------
// Core integration function
// ---------------------------------------------------------------------------

/**
 * Evaluate guidance triggers for a result and return the attachment record.
 *
 * Call this after a result is approved (authorization flow, Story 42.5).
 * The return value should be included in the distribution payload (Story 42.6).
 *
 * @param resultValues      - Map of field code → numeric/string/null value
 * @param templateLoincCode - LOINC code identifying the result template
 * @param resultId          - Opaque result UUID (for audit events — no PHI)
 * @param language          - Patient's preferred language (for audit metadata)
 * @returns                 GuidanceAttachment with guidance IDs, or null if none triggered
 */
export function evaluateAndAttachGuidance(
  resultValues: Record<string, number | string | null>,
  templateLoincCode: string,
  resultId: string,
  language: string = 'en',
): GuidanceAttachment | null {
  const matchedContent = evaluateGuidanceTriggers(resultValues, templateLoincCode)

  if (matchedContent.length === 0) return null

  const guidanceContentIds = matchedContent.map((c) => c.id)
  const conditionCodes = matchedContent.map((c) => c.conditionCode)

  const attachment: GuidanceAttachment = {
    guidanceContentIds,
    conditionCodes,
    evaluatedAt: new Date().toISOString(),
  }

  // Emit audit events — one per condition (never throws; fire-and-forget)
  for (const content of matchedContent) {
    const ruleIds = getMatchingGuidanceRuleIds(
      content.conditionCode,
      resultValues,
      templateLoincCode,
    )

    reportGuidanceEvent({
      action: 'GUIDANCE_TRIGGERED',
      guidanceId: content.id,
      conditionCode: content.conditionCode,
      language,
      deliveryChannel: 'lab-result',
      resultId,
      ruleIds,
    })

    reportGuidanceEvent({
      action: 'GUIDANCE_ATTACHED',
      guidanceId: content.id,
      conditionCode: content.conditionCode,
      language,
      deliveryChannel: 'lab-result',
      resultId,
    })
  }

  return attachment
}

/**
 * Emit a GUIDANCE_DELIVERED event when guidance is included in a distribution payload.
 * Called from dispatchResultRelease or equivalent (Story 42.6 integration).
 * Never throws — delivery must not be blocked by audit failures.
 */
export function reportGuidanceDelivery(
  guidanceIds: string[],
  conditionCodes: string[],
  resultId: string,
  language: string,
  deliveryChannel: 'patient-lite' | 'delegate' | 'lab-result',
): void {
  for (let i = 0; i < guidanceIds.length; i++) {
    reportGuidanceEvent({
      action: 'GUIDANCE_DELIVERED',
      guidanceId: guidanceIds[i],
      conditionCode: conditionCodes[i] ?? 'unknown',
      language,
      deliveryChannel,
      resultId,
    })
  }
}

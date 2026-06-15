/**
 * Public Health Guidance — Trigger Engine
 *
 * Story 53.7 — AC: 1, 7
 *
 * Evaluates deterministic rules against structured result field values and
 * returns the matching GuidanceContent records.
 *
 * Design notes:
 * - Deterministic mapping — no AI/ML. Pure conditional logic.
 * - Analogous to `trigger-engine.ts` (knowledge cards, Story 53.1).
 * - Returns empty array when nothing matches — never null.
 * - PHI safety: receives only numeric/string field values keyed by field
 *   codes. Never receives patient identifiers, names, or clinical notes.
 * - Multiple conditions may match for a single result (e.g., malaria RDT
 *   positive AND severe anemia from CBC on the same patient encounter).
 * - Each GuidanceContent appears at most once in the output (deduplicated by
 *   conditionCode even if multiple trigger rules map to the same condition).
 */

import type { GuidanceContent, GuidanceTrigger } from '@/lib/public-health-guidance'
import { GUIDANCE_BY_CONDITION_CODE } from '@/lib/guidance-seed-data'

// ---------------------------------------------------------------------------
// Trigger rules — deterministic mapping from result fields to conditions
// ---------------------------------------------------------------------------

/**
 * All guidance trigger rules, ordered by priority (highest first).
 * Each rule independently maps a field value to a condition code.
 *
 * LOINC codes used:
 *   32700-7  Malaria smear
 *   5028-2   Malaria RDT
 *   58410-2  CBC (hemoglobin field 'hgb')
 *   25398-2  Mycobacterium/TB (GeneXpert or smear)
 *   24365-0  Hepatitis B surface antigen
 *   13955-0  Hepatitis C antibody
 *   75622-1  HIV rapid test (WHO) — confirmatory testing note in GuidanceContent
 *   '*'      Any template (used for result_code positive triggers)
 */
export const GUIDANCE_TRIGGER_RULES: GuidanceTrigger[] = [
  // -----------------------------------------------------------------------
  // Malaria — RDT positive
  // -----------------------------------------------------------------------
  {
    id: 'GT-MALARIA-RDT-001',
    conditionCode: 'MALARIA_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '5028-2',
    fieldCode: 'malaria_result',
    operator: 'positive',
  },
  // Malaria — smear positive
  {
    id: 'GT-MALARIA-SMEAR-001',
    conditionCode: 'MALARIA_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '32700-7',
    fieldCode: 'malaria_result',
    operator: 'positive',
  },

  // -----------------------------------------------------------------------
  // TB — GeneXpert positive
  // -----------------------------------------------------------------------
  {
    id: 'GT-TB-GENEXPERT-001',
    conditionCode: 'TB_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '25398-2',
    fieldCode: 'mtb_detected',
    operator: 'positive',
  },
  // TB — smear positive
  {
    id: 'GT-TB-SMEAR-001',
    conditionCode: 'TB_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '25398-2',
    fieldCode: 'afb_result',
    operator: 'positive',
  },

  // -----------------------------------------------------------------------
  // Hepatitis B — surface antigen positive
  // -----------------------------------------------------------------------
  {
    id: 'GT-HEPB-SAG-001',
    conditionCode: 'HEPATITIS_B_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '24365-0',
    fieldCode: 'hbsag_result',
    operator: 'positive',
  },

  // -----------------------------------------------------------------------
  // Hepatitis C — antibody positive
  // -----------------------------------------------------------------------
  {
    id: 'GT-HEPC-AB-001',
    conditionCode: 'HEPATITIS_C_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '13955-0',
    fieldCode: 'hcv_result',
    operator: 'positive',
  },

  // -----------------------------------------------------------------------
  // HIV — rapid test positive (note: confirmatory required, stated in guidance)
  // -----------------------------------------------------------------------
  {
    id: 'GT-HIV-RAPID-001',
    conditionCode: 'HIV_POSITIVE',
    triggerType: 'result_code',
    templateLoincCode: '75622-1',
    fieldCode: 'hiv_result',
    operator: 'positive',
  },

  // -----------------------------------------------------------------------
  // Severe anemia — hemoglobin < 7 g/dL on CBC
  // -----------------------------------------------------------------------
  {
    id: 'GT-ANEMIA-HGB-001',
    conditionCode: 'ANEMIA_SEVERE',
    triggerType: 'result_value',
    templateLoincCode: '58410-2',
    fieldCode: 'hgb',
    operator: 'lt',
    value: 7,
  },
]

// ---------------------------------------------------------------------------
// "Positive" value normalization
// ---------------------------------------------------------------------------

const POSITIVE_CODE_SYNONYMS = new Set([
  'positive', 'pos', 'reactive', 'detected', 'present', 'true', '1', 'yes',
])

function isPositiveValue(fieldValue: string | number | null | undefined): boolean {
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') return false
  const str = String(fieldValue).toLowerCase().trim()
  return POSITIVE_CODE_SYNONYMS.has(str)
}

// ---------------------------------------------------------------------------
// Template LOINC compatibility
// ---------------------------------------------------------------------------

function ruleAppliesToTemplate(
  ruleLoinc: string,
  templateLoincCode: string,
): boolean {
  return ruleLoinc === '*' || ruleLoinc === templateLoincCode
}

// ---------------------------------------------------------------------------
// Single rule evaluation
// ---------------------------------------------------------------------------

function evaluateRule(
  rule: GuidanceTrigger,
  resultValues: Record<string, number | string | null>,
  templateLoincCode: string,
): boolean {
  if (!ruleAppliesToTemplate(rule.templateLoincCode, templateLoincCode)) return false
  if (!rule.fieldCode) return false

  const fieldValue = resultValues[rule.fieldCode] ?? null

  if (rule.triggerType === 'result_code') {
    // 'positive' is the only supported operator for code-based triggers
    return isPositiveValue(fieldValue)
  }

  // result_value: numeric comparison
  if (fieldValue === null || fieldValue === undefined || fieldValue === '') return false
  const num = typeof fieldValue === 'number' ? fieldValue : parseFloat(String(fieldValue))
  if (isNaN(num)) return false

  switch (rule.operator) {
    case 'gt':  return rule.value !== undefined && num > (rule.value as number)
    case 'gte': return rule.value !== undefined && num >= (rule.value as number)
    case 'lt':  return rule.value !== undefined && num < (rule.value as number)
    case 'eq':  return rule.value !== undefined && num === (rule.value as number)
    default:    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all guidance trigger rules against the given result field values
 * and return matching GuidanceContent records.
 *
 * @param resultValues      - Map of field code → numeric/string/null value
 * @param templateLoincCode - The top-level LOINC code of the active template
 * @returns                 Array of matching GuidanceContent (may be empty)
 */
export function evaluateGuidanceTriggers(
  resultValues: Record<string, number | string | null>,
  templateLoincCode: string,
): GuidanceContent[] {
  const matched: GuidanceContent[] = []
  const seenConditionCodes = new Set<string>()

  for (const rule of GUIDANCE_TRIGGER_RULES) {
    if (!evaluateRule(rule, resultValues, templateLoincCode)) continue

    // Deduplicate by conditionCode — multiple rules may share one
    if (seenConditionCodes.has(rule.conditionCode)) continue

    const content = GUIDANCE_BY_CONDITION_CODE.get(rule.conditionCode)
    if (!content) continue

    seenConditionCodes.add(rule.conditionCode)
    matched.push(content)
  }

  return matched
}

/**
 * Return the IDs of trigger rules that fired for a specific condition code.
 * Used by audit events to record which rules triggered the guidance.
 */
export function getMatchingGuidanceRuleIds(
  conditionCode: string,
  resultValues: Record<string, number | string | null>,
  templateLoincCode: string,
): string[] {
  return GUIDANCE_TRIGGER_RULES
    .filter(
      (rule) =>
        rule.conditionCode === conditionCode &&
        evaluateRule(rule, resultValues, templateLoincCode),
    )
    .map((rule) => rule.id)
}

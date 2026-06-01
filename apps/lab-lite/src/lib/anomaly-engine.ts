/**
 * Anomaly Detection Engine — Story 53.3: AI Anomaly Flagging
 *
 * Deterministic, rule-based statistical anomaly detection for structured
 * numeric lab result data. No ML inference, no network dependency — fully
 * offline-capable.
 *
 * CLAUDE.md safety rules:
 * - AI NEVER names a diagnosis. All flag descriptions use pattern language.
 * - Every flag includes the mandatory disclaimer (AC: 5).
 * - PHI guard: input is `Record<string, number | null>` + LOINC codes only.
 *   No patient identifiers enter or leave this module.
 * - Confidence Inversion Principle (Story 53.5): lower confidence → louder UI.
 */

import { ANOMALY_RULES } from './anomaly-rules'
import type { AnomalyRule, AnomalyCondition, AnomalySeverity } from './anomaly-rules'
import { ConfidenceLevel } from './confidence'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnomalyInput {
  /** Numeric field values keyed by template field code (e.g. 'wbc', 'rbc'). No PHI. */
  currentValues: Record<string, number | null>
  /** Most recent prior result values for the same patient+template. Null = no prior. */
  priorValues?: Record<string, number | null> | null
  /** Panel-level LOINC code of the template (used to select applicable rules). */
  templateLoincCode: string
}

export interface AnomalyFlag {
  ruleId: string
  ruleName: string
  /** i18n key — pattern description, NEVER a diagnosis */
  descriptionKey: string
  confidence: ConfidenceLevel
  severity: AnomalySeverity
  /** Field codes that triggered this match (for traceability — no values, no PHI) */
  matchedConditions: string[]
  /** Mandatory on every flag (AC: 5) */
  readonly disclaimer: 'Statistical pattern flag — not a diagnosis. Clinical correlation required.'
}

const DISCLAIMER = 'Statistical pattern flag — not a diagnosis. Clinical correlation required.' as const

// ---------------------------------------------------------------------------
// Severity ordering (urgent > elevated > notable)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  urgent: 3,
  elevated: 2,
  notable: 1,
}

// ---------------------------------------------------------------------------
// Condition evaluation helpers
// ---------------------------------------------------------------------------

function compareOp(value: number, operator: AnomalyCondition['operator'], threshold: number): boolean {
  switch (operator) {
    case 'gt':  return value > threshold
    case 'lt':  return value < threshold
    case 'gte': return value >= threshold
    case 'lte': return value <= threshold
    default:    return false
  }
}

function evaluateCondition(
  condition: AnomalyCondition,
  currentValues: Record<string, number | null>,
  priorValues: Record<string, number | null> | null | undefined,
): boolean {
  const current = currentValues[condition.fieldCode]

  if (condition.type === 'value_threshold' || condition.type === 'value_combination') {
    if (current == null) return false
    if (condition.operator === 'between') {
      if (!condition.valueRange) return false
      return current >= condition.valueRange.min && current <= condition.valueRange.max
    }
    if (condition.value == null) return false
    return compareOp(current, condition.operator, condition.value)
  }

  if (condition.type === 'delta_change') {
    if (!priorValues) return false
    const prior = priorValues[condition.fieldCode]
    if (current == null || prior == null || prior === 0) return false

    const { deltaDirection = 'either', deltaPercent, value: absoluteThreshold } = condition

    const delta = current - prior

    // Direction check
    if (deltaDirection === 'increase' && delta <= 0) return false
    if (deltaDirection === 'decrease' && delta >= 0) return false

    const absDelta = Math.abs(delta)
    const pctChange = (absDelta / Math.abs(prior)) * 100

    // Absolute threshold check (e.g. Hgb drop >3 g/dL)
    if (absoluteThreshold != null && deltaPercent === 0) {
      return absDelta > absoluteThreshold
    }

    // Percentage threshold check
    if (deltaPercent != null && deltaPercent > 0) {
      return pctChange > deltaPercent
    }

    return false
  }

  return false
}

// ---------------------------------------------------------------------------
// Core detection function
// ---------------------------------------------------------------------------

/**
 * Detect statistical anomaly patterns in a structured result.
 *
 * @param input - Current numeric values, optional prior values, and template LOINC code.
 * @returns Array of AnomalyFlag matching the result, sorted by severity (urgent first).
 *
 * PHI contract: this function never receives patient identifiers. Input is
 * `Record<string, number | null>` keyed by template field codes only.
 */
export function detectAnomalies(input: AnomalyInput): AnomalyFlag[] {
  const { currentValues, priorValues, templateLoincCode } = input

  // Filter rules applicable to this template
  const applicableRules = ANOMALY_RULES.filter((rule) =>
    rule.applicableTemplates.includes(templateLoincCode),
  )

  const flags: AnomalyFlag[] = []

  for (const rule of applicableRules) {
    // Skip delta rules when no prior result is available
    if (rule.type === 'delta' && !priorValues) continue

    // Evaluate all conditions (AND logic)
    const matchedFields: string[] = []
    let allMatch = true

    for (const condition of rule.conditions) {
      const matched = evaluateCondition(condition, currentValues, priorValues)
      if (matched) {
        matchedFields.push(condition.fieldCode)
      } else {
        allMatch = false
        break
      }
    }

    if (allMatch && matchedFields.length > 0) {
      flags.push({
        ruleId: rule.id,
        ruleName: rule.name,
        descriptionKey: rule.descriptionKey,
        confidence: rule.confidence,
        severity: rule.severity,
        matchedConditions: matchedFields,
        disclaimer: DISCLAIMER,
      })
    }
  }

  // Sort: urgent first, then elevated, then notable
  return flags.sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  )
}

/**
 * Map a confidence level to a numeric score (0–1) for provenance logging.
 * HIGH=0.90, MEDIUM=0.65, LOW=0.30 — representative mid-band values.
 */
export function confidenceToScore(level: ConfidenceLevel): number {
  switch (level) {
    case ConfidenceLevel.HIGH:   return 0.90
    case ConfidenceLevel.MEDIUM: return 0.65
    case ConfidenceLevel.LOW:    return 0.30
  }
}

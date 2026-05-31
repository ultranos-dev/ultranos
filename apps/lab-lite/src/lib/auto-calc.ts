/**
 * Auto-Calculation Engine — Story 42.4 (AC: 3, 4)
 *
 * Computes derived/calculated fields (e.g. MCV, MCH, MCHC in CBC)
 * from user-entered prerequisite values. All calculation logic lives
 * in the template field definitions (TemplateField.autoCalc.formula).
 *
 * Rules:
 *   - If any prerequisite field value is null, the calculated field is null.
 *   - Results are rounded to the field's decimalPrecision (default: 2).
 *   - Non-auto-calc fields are returned unchanged.
 *   - Returns a new object — does not mutate the input.
 *
 * PHI note: no patient data flows through this module.
 */

import type { ResultTemplate } from '@/lib/result-templates'

/**
 * Round a number to the given number of decimal places.
 */
function round(value: number, precision: number): number {
  const factor = Math.pow(10, precision)
  return Math.round(value * factor) / factor
}

/**
 * Compute all auto-calculated fields for a template, given the current
 * set of entered values. Returns a new merged record with calculated
 * fields filled in (or null if prerequisites are missing).
 *
 * @param values   - Current field values keyed by field code
 * @param template - The result template containing field definitions
 */
export function computeAutoFields(
  values: Record<string, number | null>,
  template: ResultTemplate,
): Record<string, number | null> {
  const result = { ...values }

  for (const field of template.fields) {
    if (!field.autoCalc) continue

    const { formula, prerequisites } = field.autoCalc
    const precision = field.decimalPrecision ?? 2

    // If any prerequisite is null, skip calculation
    const allPresent = prerequisites.every((p) => values[p] != null)
    if (!allPresent) {
      result[field.code] = null
      continue
    }

    const computed = formula(values)
    result[field.code] = computed != null ? round(computed, precision) : null
  }

  return result
}

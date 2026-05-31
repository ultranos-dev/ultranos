/**
 * Internal Consistency Checker
 * Story 43.5 — Task 4
 *
 * Checks a set of analyte values for physiologically inconsistent combinations.
 * Rules only fire when ALL requiredAnalytes are present in the provided map.
 * All computation is purely local — zero network calls, zero Dexie reads.
 */

import { CONSISTENCY_RULES } from './consistency-rules'
import type { PlausibilityFlag } from './types'

/**
 * Check a full result set for internal consistency violations.
 *
 * @param values  Map of LOINC code → numeric value for all analytes in the result set
 * @returns Array of PlausibilityFlag for each consistency rule violation found
 */
export function checkConsistency(values: Record<string, number>): PlausibilityFlag[] {
  const flags: PlausibilityFlag[] = []

  for (const rule of CONSISTENCY_RULES) {
    // Only fire the rule if ALL required analytes are present
    const allPresent = rule.requiredAnalytes.every((loinc) => loinc in values)
    if (!allPresent) continue

    if (rule.condition(values)) {
      flags.push({
        id: `consistency-${rule.id}-${Date.now()}`,
        ruleType: 'INTERNAL_CONSISTENCY',
        analyte: rule.name,
        loincCode: rule.requiredAnalytes.join('+'),
        severity: rule.severity,
        message: rule.message,
        acknowledged: false,
      })
    }
  }

  return flags
}

/**
 * Absolute Range Checker
 * Story 43.5 — Task 2
 *
 * Checks a single analyte value against hardcoded physiological limits.
 * Returns CRITICAL for values outside the absolute (impossible) range,
 * CRITICAL for values outside the critical clinical range,
 * WARNING for values outside the warn range,
 * and null if the value is within acceptable bounds.
 *
 * All computation is purely local — zero network calls, zero Dexie reads.
 */

import { ABSOLUTE_RANGES } from './absolute-ranges'
import type { PlausibilityFlag } from './types'

/**
 * Check a single analyte value against absolute physiological ranges.
 *
 * @param loincCode  LOINC code for the analyte
 * @param value      Numeric result value in the analyte's canonical unit
 * @returns PlausibilityFlag if flagged, null if value is within acceptable bounds
 *          or if the analyte has no entry in ABSOLUTE_RANGES
 */
export function checkAbsoluteRange(loincCode: string, value: number): PlausibilityFlag | null {
  const range = ABSOLUTE_RANGES[loincCode]
  if (!range) return null

  // Outside absolute (physiologically impossible) limits → CRITICAL
  if (value < range.absMin || value > range.absMax) {
    return {
      id: `abs-impossible-${loincCode}-${Date.now()}`,
      ruleType: 'ABSOLUTE_RANGE',
      analyte: range.analyteName,
      loincCode,
      severity: 'CRITICAL',
      message: `${range.analyteName} value ${value} ${range.unit} is outside physiologically possible range (${range.absMin}–${range.absMax} ${range.unit})`,
      currentValue: value,
      threshold: value < range.absMin ? range.absMin : range.absMax,
      acknowledged: false,
    }
  }

  // Outside critical clinical limits → CRITICAL
  if (value < range.criticalMin || value > range.criticalMax) {
    return {
      id: `abs-critical-${loincCode}-${Date.now()}`,
      ruleType: 'ABSOLUTE_RANGE',
      analyte: range.analyteName,
      loincCode,
      severity: 'CRITICAL',
      message: `${range.analyteName} value ${value} ${range.unit} is outside critical range (${range.criticalMin}–${range.criticalMax} ${range.unit})`,
      currentValue: value,
      threshold: value < range.criticalMin ? range.criticalMin : range.criticalMax,
      acknowledged: false,
    }
  }

  // Outside warning limits (if defined) → WARNING
  if (range.warnMin !== undefined && range.warnMax !== undefined) {
    if (value < range.warnMin || value > range.warnMax) {
      return {
        id: `abs-warn-${loincCode}-${Date.now()}`,
        ruleType: 'ABSOLUTE_RANGE',
        analyte: range.analyteName,
        loincCode,
        severity: 'WARNING',
        message: `${range.analyteName} value ${value} ${range.unit} is outside expected range (${range.warnMin}–${range.warnMax} ${range.unit})`,
        currentValue: value,
        threshold: value < range.warnMin ? range.warnMin : range.warnMax,
        acknowledged: false,
      }
    }
  } else if (range.warnMin !== undefined && value < range.warnMin) {
    return {
      id: `abs-warn-${loincCode}-${Date.now()}`,
      ruleType: 'ABSOLUTE_RANGE',
      analyte: range.analyteName,
      loincCode,
      severity: 'WARNING',
      message: `${range.analyteName} value ${value} ${range.unit} is below expected minimum (${range.warnMin} ${range.unit})`,
      currentValue: value,
      threshold: range.warnMin,
      acknowledged: false,
    }
  } else if (range.warnMax !== undefined && value > range.warnMax) {
    return {
      id: `abs-warn-${loincCode}-${Date.now()}`,
      ruleType: 'ABSOLUTE_RANGE',
      analyte: range.analyteName,
      loincCode,
      severity: 'WARNING',
      message: `${range.analyteName} value ${value} ${range.unit} is above expected maximum (${range.warnMax} ${range.unit})`,
      currentValue: value,
      threshold: range.warnMax,
      acknowledged: false,
    }
  }

  return null
}

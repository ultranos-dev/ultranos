/**
 * Result Plausibility Checker — Story 43.5 + Story 43.8 (Task 8)
 *
 * Performs up to four sequential checks on a numeric lab result:
 *   1. PHYSIOLOGICAL_IMPOSSIBLE — absolute range check (universal, static)
 *   2. DELTA_CHECK — change-from-previous-result check (not yet implemented — stub)
 *   3. INSTRUMENT_LINEARITY — outside instrument measurement range (not yet implemented — stub)
 *   4. REFERENCE_RANGE — localized normal/abnormal flagging using Story 43.8 ranges
 *
 * Check types 1-3 remain static (physiological impossibility cannot be overridden
 * by altitude or population — a hemoglobin of 0 g/dL is always impossible).
 * Check type 4 uses localized ranges (Story 43.8) and replaces any hardcoded
 * normal/abnormal logic that would otherwise be in the result template.
 *
 * PHI note: no patient data except opaque age and gender used here.
 */

import type { ReferenceRange } from './reference-ranges/types'
import { flagResult } from './reference-ranges/result-flagger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlausibilityCheckType =
  | 'PHYSIOLOGICAL_IMPOSSIBLE'
  | 'DELTA_CHECK'
  | 'INSTRUMENT_LINEARITY'
  | 'REFERENCE_RANGE'

export type PlausibilityOutcome = 'PASS' | 'WARNING' | 'FAIL'

export interface PlausibilityCheckResult {
  checkType: PlausibilityCheckType
  outcome: PlausibilityOutcome
  /**
   * FHIR Observation interpretation code if outcome is WARNING/FAIL.
   * Only set for REFERENCE_RANGE check type.
   */
  flagCode?: 'N' | 'L' | 'H' | 'LL' | 'HH'
  message?: string
}

export interface PlausibilityReport {
  value: number
  loincCode: string
  unit: string
  checks: PlausibilityCheckResult[]
  /** Highest severity outcome across all checks. */
  overallOutcome: PlausibilityOutcome
}

// ---------------------------------------------------------------------------
// Absolute physiological range table — Story 43.5 / Task 8.1, 8.2
//
// These are UNIVERSAL values that define physiological impossibility.
// They cannot be overridden by altitude or population settings.
// Values outside these ranges indicate instrument error or pre-analytical failure.
// ---------------------------------------------------------------------------

interface AbsoluteRange {
  absoluteMin: number
  absoluteMax: number
  unit: string
}

const ABSOLUTE_RANGES: Record<string, AbsoluteRange> = {
  // Hematology
  '718-7':  { absoluteMin: 0, absoluteMax: 25,    unit: 'g/dL' },    // Hemoglobin
  '4544-3': { absoluteMin: 0, absoluteMax: 75,    unit: '%' },        // Hematocrit
  '6690-2': { absoluteMin: 0, absoluteMax: 500,   unit: '10^3/uL' },  // WBC
  '777-3':  { absoluteMin: 0, absoluteMax: 2000,  unit: '10^3/uL' },  // Platelets
  '789-8':  { absoluteMin: 0, absoluteMax: 15,    unit: '10^6/uL' },  // RBC
  // Chemistry
  '1558-6': { absoluteMin: 0, absoluteMax: 2000,  unit: 'mg/dL' },    // Glucose fasting
  '2160-0': { absoluteMin: 0, absoluteMax: 100,   unit: 'mg/dL' },    // Creatinine
  '2951-2': { absoluteMin: 50, absoluteMax: 200,  unit: 'mEq/L' },    // Sodium
  '2823-3': { absoluteMin: 0, absoluteMax: 15,    unit: 'mEq/L' },    // Potassium
  '1742-6': { absoluteMin: 0, absoluteMax: 5000,  unit: 'U/L' },      // ALT
  '1920-8': { absoluteMin: 0, absoluteMax: 5000,  unit: 'U/L' },      // AST
  '1975-2': { absoluteMin: 0, absoluteMax: 50,    unit: 'mg/dL' },    // Total bilirubin
  // Endocrine
  '3016-3': { absoluteMin: 0, absoluteMax: 1000,  unit: 'uIU/mL' },   // TSH
  '4548-4': { absoluteMin: 0, absoluteMax: 25,    unit: '%' },         // HbA1c
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all plausibility checks on a single numeric result value.
 *
 * @param loincCode    - LOINC code of the analyte
 * @param value        - Measured numeric value
 * @param unit         - Unit of measurement (for reference only)
 * @param localizedRange - Resolved localized reference range (from Story 43.8 resolver).
 *                        Pass null if no range is available — check #4 is skipped.
 */
export function checkPlausibility(
  loincCode: string,
  value: number,
  unit: string,
  localizedRange: ReferenceRange | null,
): PlausibilityReport {
  const checks: PlausibilityCheckResult[] = []

  // Check 1: Physiological impossibility (absolute range)
  checks.push(checkPhysiologicalImpossibility(loincCode, value))

  // Check 2: Delta check — stub (future: requires previous result from Dexie)
  checks.push({ checkType: 'DELTA_CHECK', outcome: 'PASS' })

  // Check 3: Instrument linearity — stub (future: requires instrument config)
  checks.push({ checkType: 'INSTRUMENT_LINEARITY', outcome: 'PASS' })

  // Check 4: Reference range check — Story 43.8 (Task 8.3, 8.4)
  checks.push(checkReferenceRange(value, localizedRange))

  const overallOutcome = computeOverallOutcome(checks)

  return { value, loincCode, unit, checks, overallOutcome }
}

// ---------------------------------------------------------------------------
// Individual check implementations
// ---------------------------------------------------------------------------

function checkPhysiologicalImpossibility(loincCode: string, value: number): PlausibilityCheckResult {
  const abs = ABSOLUTE_RANGES[loincCode]
  if (!abs) {
    // No absolute range defined for this LOINC — cannot check
    return { checkType: 'PHYSIOLOGICAL_IMPOSSIBLE', outcome: 'PASS' }
  }

  if (value < abs.absoluteMin || value > abs.absoluteMax) {
    return {
      checkType: 'PHYSIOLOGICAL_IMPOSSIBLE',
      outcome: 'FAIL',
      message: `Value ${value} is outside the physiologically possible range [${abs.absoluteMin}–${abs.absoluteMax}] ${abs.unit}`,
    }
  }

  return { checkType: 'PHYSIOLOGICAL_IMPOSSIBLE', outcome: 'PASS' }
}

function checkReferenceRange(
  value: number,
  range: ReferenceRange | null,
): PlausibilityCheckResult {
  if (!range) {
    return {
      checkType: 'REFERENCE_RANGE',
      outcome: 'PASS',
      message: 'No reference range available — flagging skipped',
    }
  }

  const flagged = flagResult(value, range)

  if (flagged.flag === 'N') {
    return { checkType: 'REFERENCE_RANGE', outcome: 'PASS', flagCode: 'N' }
  }

  // LL and HH are critical — FAIL; L and H are abnormal — WARNING
  const outcome: PlausibilityOutcome =
    flagged.flag === 'LL' || flagged.flag === 'HH' ? 'FAIL' : 'WARNING'

  return {
    checkType: 'REFERENCE_RANGE',
    outcome,
    flagCode: flagged.flag,
    message: `Value ${value} is ${flagged.level.toLowerCase().replace('_', ' ')} (${flagged.flag}). Normal range: ${range.rangeMin}–${range.rangeMax} ${range.unit}`,
  }
}

function computeOverallOutcome(checks: PlausibilityCheckResult[]): PlausibilityOutcome {
  if (checks.some((c) => c.outcome === 'FAIL')) return 'FAIL'
  if (checks.some((c) => c.outcome === 'WARNING')) return 'WARNING'
  return 'PASS'
}

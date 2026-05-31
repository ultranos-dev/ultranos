/**
 * Result interpretation logic — Story 45.4: Plain-Language Audio Result Summaries
 *
 * Converts numeric lab values + reference range boundaries → Interpretation level.
 * Used to determine which audio script and color indicator to show the patient.
 *
 * Story 45.4 AC: #3, Task 6
 */

export type Interpretation = 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high'

export interface ResultReferenceRange {
  low: number
  high: number
  criticalLow?: number
  criticalHigh?: number
}

/**
 * Maps a numeric result value to a patient-facing interpretation level.
 *
 * Priority (evaluated outer → inner so critical beats non-critical):
 *   critical-low  → value ≤ criticalLow (when criticalLow is defined)
 *   critical-high → value ≥ criticalHigh (when criticalHigh is defined)
 *   low           → value < low
 *   high          → value > high
 *   normal        → value within [low, high] inclusive
 *
 * @param value          Numeric result value (e.g. 9.2 for hemoglobin)
 * @param referenceRange Reference range with optional critical thresholds
 * @returns              Interpretation level for the patient-facing view
 */
export function interpretResult(
  value: number,
  referenceRange: ResultReferenceRange,
): Interpretation {
  const { low, high, criticalLow, criticalHigh } = referenceRange

  if (criticalLow !== undefined && value <= criticalLow) return 'critical-low'
  if (criticalHigh !== undefined && value >= criticalHigh) return 'critical-high'
  if (value < low) return 'low'
  if (value > high) return 'high'
  return 'normal'
}

/**
 * Stores the interpretation alongside a result record in Dexie so that the
 * audio script can be resolved offline without re-computing from the value.
 *
 * Story 45.4 Task 6.2 — attach to the result record at authorization time.
 */
export interface ResultInterpretationRecord {
  resultFieldId: string
  interpretation: Interpretation
  computedAt: string // ISO 8601
}

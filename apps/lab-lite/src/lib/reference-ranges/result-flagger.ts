/**
 * Result Auto-Flagging — Story 43.8 (AC #2)
 *
 * Evaluates a numeric result value against a resolved localized ReferenceRange
 * and returns a FHIR Observation interpretation code + semantic level.
 *
 * Flag priority (critical before non-critical to prevent mis-classification):
 *   CRITICAL_LOW  → LL
 *   LOW           → L
 *   CRITICAL_HIGH → HH
 *   HIGH          → H
 *   NORMAL        → N
 *
 * Boundaries are inclusive at both ends for the normal range.
 *
 * PHI note: no patient data processed here — only numeric values and range bounds.
 */

import type { ReferenceRange, FlagResult, ResultFlag, ResultFlagCode } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a numeric result value against a localized reference range.
 *
 * @param value - The numeric measurement
 * @param range - The resolved ReferenceRange (from range-resolver)
 * @returns FlagResult containing both the FHIR code ('N','L','H','LL','HH')
 *          and the semantic level ('NORMAL','LOW','HIGH','CRITICAL_LOW','CRITICAL_HIGH')
 */
export function flagResult(value: number, range: ReferenceRange): FlagResult {
  // Critical low — evaluated first (LL beats L at boundary)
  if (range.criticalMin !== undefined && value <= range.criticalMin) {
    return { flag: 'LL', level: 'CRITICAL_LOW' }
  }

  // Low
  if (value < range.rangeMin) {
    return { flag: 'L', level: 'LOW' }
  }

  // Critical high — evaluated before high (HH beats H at boundary)
  if (range.criticalMax !== undefined && value >= range.criticalMax) {
    return { flag: 'HH', level: 'CRITICAL_HIGH' }
  }

  // High
  if (value > range.rangeMax) {
    return { flag: 'H', level: 'HIGH' }
  }

  // Normal
  return { flag: 'N', level: 'NORMAL' }
}

// ---------------------------------------------------------------------------
// Convenience: flag code only (for callers that just need the FHIR code)
// ---------------------------------------------------------------------------

export function getFlagCode(value: number, range: ReferenceRange): ResultFlagCode {
  return flagResult(value, range).flag
}

// ---------------------------------------------------------------------------
// Convenience: flag level only (for callers that just need the semantic level)
// ---------------------------------------------------------------------------

export function getFlagLevel(value: number, range: ReferenceRange): ResultFlag {
  return flagResult(value, range).level
}

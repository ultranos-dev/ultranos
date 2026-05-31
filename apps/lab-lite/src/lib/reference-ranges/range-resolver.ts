/**
 * Range Resolution Engine — Story 43.8 (AC #1, #2)
 *
 * Resolves the most specific applicable reference range for a given analyte,
 * patient demographics, and lab altitude. All resolution is pure/synchronous
 * over a provided array of ranges (no direct Dexie calls — callers fetch from
 * Dexie + defaults and pass them in, enabling easy unit testing).
 *
 * Resolution priority (highest → lowest):
 *   1. LAB_CUSTOM: loincCode + age bracket + gender + altitude match
 *   2. LAB_CUSTOM: loincCode + age bracket + gender (no altitude filter)
 *   3. DEFAULT:    loincCode + age bracket + gender + altitude match
 *   4. DEFAULT:    loincCode + age bracket + gender (no altitude filter)
 *   5. DEFAULT:    loincCode + age bracket + gender='ALL'
 *   6. → return null (result marked "No reference range available")
 *
 * Altitude matching:
 *   A range's altitudeMin defines the minimum lab altitude it applies to.
 *   If altitudeMax is set, the lab altitude must also be ≤ altitudeMax.
 *   The MOST SPECIFIC altitude match wins (highest altitudeMin that still ≤ labAltitude).
 *
 * PHI note: patientAge and patientGender are already minimized values — no DOB.
 */

import type { ReferenceRange, RangeSource } from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the reference range to use for a given analyte + patient context.
 *
 * @param loincCode    - LOINC code of the analyte
 * @param patientAge   - Patient age in years
 * @param patientGender - 'M' | 'F' | other (mapped to 'M'/'F' or falls back to ALL)
 * @param labAltitude  - Lab altitude in metres (0 = sea level)
 * @param ranges       - Combined pool: lab-custom ranges (from Dexie) + default ranges
 * @returns The best matching ReferenceRange, or null if none found
 */
export function resolveRange(
  loincCode: string,
  patientAge: number,
  patientGender: string,
  labAltitude: number,
  ranges: ReferenceRange[],
): ReferenceRange | null {
  const gender = normalizeGender(patientGender)

  // Filter to only ranges for this LOINC code, currently active (no effectiveTo)
  const candidates = ranges.filter(
    (r) => r.loincCode === loincCode && !r.effectiveTo,
  )
  if (candidates.length === 0) return null

  // Attempt each priority tier in order
  return (
    findBestMatch(candidates, patientAge, gender, labAltitude, 'LAB_CUSTOM', true) ??
    findBestMatch(candidates, patientAge, gender, labAltitude, 'LAB_CUSTOM', false) ??
    findBestMatch(candidates, patientAge, gender, labAltitude, 'DEFAULT', true) ??
    findBestMatch(candidates, patientAge, gender, labAltitude, 'DEFAULT', false) ??
    findBestMatchAllGender(candidates, patientAge, labAltitude) ??
    null
  )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize patient gender input to 'M' | 'F' | null.
 * Accepts FHIR gender strings ('male'/'female') and single-char codes.
 */
function normalizeGender(gender: string): 'M' | 'F' | null {
  const g = gender.toLowerCase().trim()
  if (g === 'm' || g === 'male') return 'M'
  if (g === 'f' || g === 'female') return 'F'
  return null
}

/** Returns true if the range's age bracket includes the patient's age. */
function ageMatches(range: ReferenceRange, age: number): boolean {
  return age >= range.ageMin && age < range.ageMax
}

/**
 * Returns true if the range applies at the given lab altitude.
 * A range applies when:
 *   - labAltitude >= range.altitudeMin
 *   - range.altitudeMax is undefined, OR labAltitude <= range.altitudeMax
 */
function altitudeMatches(range: ReferenceRange, labAltitude: number): boolean {
  if (labAltitude < range.altitudeMin) return false
  if (range.altitudeMax !== undefined && labAltitude > range.altitudeMax) return false
  return true
}

/**
 * Among all altitude-matching ranges for a tier, return the one with the
 * highest altitudeMin (most specific match) for this lab altitude.
 */
function findBestMatch(
  candidates: ReferenceRange[],
  patientAge: number,
  gender: 'M' | 'F' | null,
  labAltitude: number,
  source: RangeSource,
  requireAltitudeFilter: boolean,
): ReferenceRange | null {
  if (gender === null) return null // caller should use findBestMatchAllGender

  const matching = candidates.filter((r) => {
    if (r.source !== source) return false
    if (r.gender !== gender) return false
    if (!ageMatches(r, patientAge)) return false
    if (requireAltitudeFilter) {
      return altitudeMatches(r, labAltitude)
    } else {
      // Non-altitude pass: only ranges that have altitudeMin = 0 (sea-level baseline)
      return r.altitudeMin === 0
    }
  })

  if (matching.length === 0) return null

  // When altitude-filtering: prefer highest altitudeMin (most specific altitude band)
  if (requireAltitudeFilter && matching.length > 1) {
    return matching.reduce((best, r) => (r.altitudeMin > best.altitudeMin ? r : best))
  }

  return matching[0]
}

/**
 * Fallback: find a range where gender='ALL' that covers this patient's age/altitude.
 * Used when no gender-specific range is found.
 */
function findBestMatchAllGender(
  candidates: ReferenceRange[],
  patientAge: number,
  labAltitude: number,
): ReferenceRange | null {
  const matching = candidates.filter(
    (r) => r.gender === 'ALL' && ageMatches(r, patientAge) && altitudeMatches(r, labAltitude),
  )
  if (matching.length === 0) return null
  // Prefer most specific altitude match
  return matching.reduce((best, r) => (r.altitudeMin > best.altitudeMin ? r : best))
}

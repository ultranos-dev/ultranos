/**
 * Abnormal Flagging Engine — Story 42.4 (AC: 2, 8)
 *
 * Evaluates a numeric result value against age/gender-specific reference ranges
 * and returns a FHIR Observation interpretation code:
 *   LL — Critical Low
 *   L  — Low
 *   H  — High
 *   HH — Critical High
 *   null — within normal range or no range available
 *
 * For select-type fields (e.g. urinalysis), use evaluateSelectFlag separately.
 *
 * Evaluation order: LL → L → HH → H → null
 * This prevents boundary mis-classification (value exactly at criticalLow
 * must be LL, not L).
 *
 * PHI note: patient age and gender used here are already minimized
 * (age in years, not DOB; gender from FHIR Patient resource).
 */

import type { TemplateField, ReferenceRange } from '@/lib/result-templates'

export type AbnormalFlag = 'L' | 'H' | 'LL' | 'HH'

/**
 * Resolve the most specific matching reference range for the given age/gender.
 * Preference order:
 *   1. Gender + age match (most specific)
 *   2. Gender-only match (no age constraint)
 *   3. Age-only match (no gender constraint)
 *   4. Universal match (no gender, no age constraint)
 *
 * Returns undefined if no applicable range is found.
 */
function resolveRange(
  ranges: ReferenceRange[],
  patientAge: number,
  patientGender: string,
): ReferenceRange | undefined {
  const gender = patientGender.toLowerCase()

  // Score each range: higher score = more specific match
  let best: ReferenceRange | undefined
  let bestScore = -1

  for (const range of ranges) {
    const genderMatch =
      !range.gender || range.gender === 'all' || range.gender === gender
    const ageMatch =
      (range.ageMin == null || patientAge >= range.ageMin) &&
      (range.ageMax == null || patientAge <= range.ageMax)

    if (!genderMatch || !ageMatch) continue

    // Score: gender-specific (+2) + age-bounded (+1 per bound)
    let score = 0
    if (range.gender && range.gender !== 'all') score += 2
    if (range.ageMin != null) score += 1
    if (range.ageMax != null) score += 1

    if (score > bestScore) {
      bestScore = score
      best = range
    }
  }

  return best
}

/**
 * Evaluate a numeric value against the field's reference ranges and return
 * the appropriate abnormal flag, or null if the value is within normal range.
 *
 * @param value        - The numeric result value to evaluate
 * @param field        - The template field definition (provides reference ranges)
 * @param patientAge   - Patient age in years
 * @param patientGender - Patient gender string ('male' | 'female' | other)
 */
export function evaluateFlag(
  value: number,
  field: TemplateField,
  patientAge: number,
  patientGender: string,
): AbnormalFlag | null {
  if (!field.referenceRanges || field.referenceRanges.length === 0) return null

  const range = resolveRange(field.referenceRanges, patientAge, patientGender)
  if (!range) return null

  // Evaluate in priority order: critical levels before non-critical
  if (range.criticalLow != null && value <= range.criticalLow) return 'LL'
  if (value < range.referenceLow) return 'L'
  if (range.criticalHigh != null && value >= range.criticalHigh) return 'HH'
  if (value > range.referenceHigh) return 'H'

  return null
}

/**
 * Evaluate a select-type field value for urinalysis abnormal detection.
 * Returns 'A' (Abnormal) for any value other than 'negative' on fields
 * that have clinical significance (protein, glucose, ketones, blood,
 * leukocyte_esterase, nitrite).
 *
 * Color and clarity are informational only — always returns null.
 *
 * @param fieldCode - The field code (e.g. 'ua_protein', 'ua_color')
 * @param value     - The selected option value (e.g. 'negative', 'trace', 'positive')
 */
export function evaluateSelectFlag(
  fieldCode: string,
  value: string | null | undefined,
): 'A' | null {
  const CLINICAL_UA_FIELDS = new Set([
    'ua_protein',
    'ua_glucose',
    'ua_ketones',
    'ua_blood',
    'ua_le',
    'ua_nitrite',
  ])

  if (!CLINICAL_UA_FIELDS.has(fieldCode)) return null
  if (!value || value === 'negative') return null
  return 'A'
}

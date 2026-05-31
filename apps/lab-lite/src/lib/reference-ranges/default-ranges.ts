/**
 * Bundled default reference ranges — Western baseline + altitude adjustments.
 * Story 43.8 — Task 1.2
 *
 * These are STATIC constants bundled in the app. They are NOT stored in Dexie.
 * Lab-custom overrides are stored in Dexie; the resolver checks Dexie first,
 * then falls back to these defaults.
 *
 * Age brackets:
 *   Neonatal:  0–1   (ageMin: 0,  ageMax: 1)
 *   Toddler:   1–5   (ageMin: 1,  ageMax: 5)
 *   Child:     5–12  (ageMin: 5,  ageMax: 12)
 *   Adolescent:12–18 (ageMin: 12, ageMax: 18)
 *   Adult:     18–65 (ageMin: 18, ageMax: 65)
 *   Elderly:   65+   (ageMin: 65, ageMax: 999)
 *
 * PHI note: no patient data in this file.
 */

import type { ReferenceRange } from './types'

// ---------------------------------------------------------------------------
// Helper to build default range entries with required metadata
// ---------------------------------------------------------------------------

let _seqId = 0
function defaultRange(partial: Omit<ReferenceRange, 'id' | 'source' | 'version' | 'effectiveFrom' | 'createdBy' | 'createdAt' | 'hlcTimestamp'>): ReferenceRange {
  _seqId++
  return {
    ...partial,
    id: `default-${partial.loincCode}-${_seqId}`,
    source: 'DEFAULT',
    version: 1,
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    createdBy: 'system',
    createdAt: '2020-01-01T00:00:00.000Z',
    hlcTimestamp: '0-0-0',
  }
}

// ---------------------------------------------------------------------------
// Hemoglobin (LOINC 718-7) — gender-specific, altitude-adjusted
// ---------------------------------------------------------------------------

const HEMOGLOBIN: ReferenceRange[] = [
  // Neonatal (0–1 yr) — both genders
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 0, ageMax: 1, gender: 'ALL', altitudeMin: 0, rangeMin: 13.5, rangeMax: 19.5, criticalMin: 7.0, criticalMax: 25.0, unit: 'g/dL' }),
  // Toddler (1–5 yr)
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 1, ageMax: 5, gender: 'ALL', altitudeMin: 0, rangeMin: 11.0, rangeMax: 14.0, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  // Child (5–12 yr)
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 5, ageMax: 12, gender: 'ALL', altitudeMin: 0, rangeMin: 11.5, rangeMax: 14.5, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  // Adolescent (12–18 yr) — gender diverges
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 12, ageMax: 18, gender: 'M', altitudeMin: 0, rangeMin: 13.0, rangeMax: 16.0, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 12, ageMax: 18, gender: 'F', altitudeMin: 0, rangeMin: 12.0, rangeMax: 15.5, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  // Adult (18–65 yr) — sea level
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 18, ageMax: 65, gender: 'M', altitudeMin: 0, rangeMin: 13.5, rangeMax: 17.5, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 18, ageMax: 65, gender: 'F', altitudeMin: 0, rangeMin: 12.0, rangeMax: 15.5, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  // Adult (18–65 yr) — altitude ≥2000m (e.g. Kabul 1800m rounding up, Bamyan 2500m)
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 18, ageMax: 65, gender: 'M', altitudeMin: 2000, rangeMin: 15.0, rangeMax: 19.5, criticalMin: 8.0, criticalMax: 22.0, unit: 'g/dL' }),
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 18, ageMax: 65, gender: 'F', altitudeMin: 2000, rangeMin: 13.5, rangeMax: 17.5, criticalMin: 8.0, criticalMax: 22.0, unit: 'g/dL' }),
  // Elderly (65+) — sea level
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 65, ageMax: 999, gender: 'M', altitudeMin: 0, rangeMin: 12.6, rangeMax: 17.4, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
  defaultRange({ loincCode: '718-7', analyteName: 'Hemoglobin', ageMin: 65, ageMax: 999, gender: 'F', altitudeMin: 0, rangeMin: 11.8, rangeMax: 15.2, criticalMin: 7.0, criticalMax: 20.0, unit: 'g/dL' }),
]

// ---------------------------------------------------------------------------
// Hematocrit (LOINC 4544-3) — gender-specific, altitude-adjusted
// ---------------------------------------------------------------------------

const HEMATOCRIT: ReferenceRange[] = [
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 0, ageMax: 1, gender: 'ALL', altitudeMin: 0, rangeMin: 42.0, rangeMax: 62.0, criticalMin: 21.0, criticalMax: 65.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 1, ageMax: 5, gender: 'ALL', altitudeMin: 0, rangeMin: 34.0, rangeMax: 40.0, criticalMin: 21.0, criticalMax: 60.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 5, ageMax: 18, gender: 'ALL', altitudeMin: 0, rangeMin: 35.0, rangeMax: 44.0, criticalMin: 21.0, criticalMax: 60.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 18, ageMax: 65, gender: 'M', altitudeMin: 0, rangeMin: 40.7, rangeMax: 50.3, criticalMin: 21.0, criticalMax: 60.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 18, ageMax: 65, gender: 'F', altitudeMin: 0, rangeMin: 36.1, rangeMax: 44.3, criticalMin: 21.0, criticalMax: 55.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 18, ageMax: 65, gender: 'M', altitudeMin: 2000, rangeMin: 45.0, rangeMax: 55.0, criticalMin: 21.0, criticalMax: 65.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 18, ageMax: 65, gender: 'F', altitudeMin: 2000, rangeMin: 40.0, rangeMax: 50.0, criticalMin: 21.0, criticalMax: 60.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 65, ageMax: 999, gender: 'M', altitudeMin: 0, rangeMin: 38.5, rangeMax: 50.0, criticalMin: 21.0, criticalMax: 60.0, unit: '%' }),
  defaultRange({ loincCode: '4544-3', analyteName: 'Hematocrit', ageMin: 65, ageMax: 999, gender: 'F', altitudeMin: 0, rangeMin: 35.0, rangeMax: 47.0, criticalMin: 21.0, criticalMax: 55.0, unit: '%' }),
]

// ---------------------------------------------------------------------------
// WBC (LOINC 6690-2)
// ---------------------------------------------------------------------------

const WBC: ReferenceRange[] = [
  defaultRange({ loincCode: '6690-2', analyteName: 'White Blood Cells', ageMin: 0, ageMax: 1, gender: 'ALL', altitudeMin: 0, rangeMin: 9.0, rangeMax: 30.0, criticalMin: 2.0, criticalMax: 50.0, unit: '10^3/uL' }),
  defaultRange({ loincCode: '6690-2', analyteName: 'White Blood Cells', ageMin: 1, ageMax: 5, gender: 'ALL', altitudeMin: 0, rangeMin: 5.5, rangeMax: 15.5, criticalMin: 2.0, criticalMax: 30.0, unit: '10^3/uL' }),
  defaultRange({ loincCode: '6690-2', analyteName: 'White Blood Cells', ageMin: 5, ageMax: 12, gender: 'ALL', altitudeMin: 0, rangeMin: 4.5, rangeMax: 13.5, criticalMin: 2.0, criticalMax: 30.0, unit: '10^3/uL' }),
  defaultRange({ loincCode: '6690-2', analyteName: 'White Blood Cells', ageMin: 12, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 4.5, rangeMax: 11.0, criticalMin: 2.0, criticalMax: 30.0, unit: '10^3/uL' }),
]

// ---------------------------------------------------------------------------
// Platelets (LOINC 777-3)
// ---------------------------------------------------------------------------

const PLATELETS: ReferenceRange[] = [
  defaultRange({ loincCode: '777-3', analyteName: 'Platelets', ageMin: 0, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 150.0, rangeMax: 400.0, criticalMin: 50.0, criticalMax: 1000.0, unit: '10^3/uL' }),
]

// ---------------------------------------------------------------------------
// Blood Glucose — Fasting (LOINC 1558-6)
// ---------------------------------------------------------------------------

const GLUCOSE_FASTING: ReferenceRange[] = [
  defaultRange({ loincCode: '1558-6', analyteName: 'Glucose (Fasting)', ageMin: 0, ageMax: 18, gender: 'ALL', altitudeMin: 0, rangeMin: 60.0, rangeMax: 100.0, criticalMin: 40.0, criticalMax: 500.0, unit: 'mg/dL' }),
  defaultRange({ loincCode: '1558-6', analyteName: 'Glucose (Fasting)', ageMin: 18, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 70.0, rangeMax: 99.0, criticalMin: 40.0, criticalMax: 500.0, unit: 'mg/dL' }),
]

// ---------------------------------------------------------------------------
// Serum Creatinine (LOINC 2160-0) — gender-specific
// ---------------------------------------------------------------------------

const CREATININE: ReferenceRange[] = [
  defaultRange({ loincCode: '2160-0', analyteName: 'Creatinine', ageMin: 0, ageMax: 12, gender: 'ALL', altitudeMin: 0, rangeMin: 0.3, rangeMax: 0.7, criticalMin: 0.1, criticalMax: 15.0, unit: 'mg/dL' }),
  defaultRange({ loincCode: '2160-0', analyteName: 'Creatinine', ageMin: 12, ageMax: 999, gender: 'M', altitudeMin: 0, rangeMin: 0.7, rangeMax: 1.3, criticalMin: 0.1, criticalMax: 15.0, unit: 'mg/dL' }),
  defaultRange({ loincCode: '2160-0', analyteName: 'Creatinine', ageMin: 12, ageMax: 999, gender: 'F', altitudeMin: 0, rangeMin: 0.5, rangeMax: 1.1, criticalMin: 0.1, criticalMax: 15.0, unit: 'mg/dL' }),
]

// ---------------------------------------------------------------------------
// Sodium (LOINC 2951-2)
// ---------------------------------------------------------------------------

const SODIUM: ReferenceRange[] = [
  defaultRange({ loincCode: '2951-2', analyteName: 'Sodium', ageMin: 0, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 136.0, rangeMax: 145.0, criticalMin: 120.0, criticalMax: 160.0, unit: 'mEq/L' }),
]

// ---------------------------------------------------------------------------
// Potassium (LOINC 2823-3)
// ---------------------------------------------------------------------------

const POTASSIUM: ReferenceRange[] = [
  defaultRange({ loincCode: '2823-3', analyteName: 'Potassium', ageMin: 0, ageMax: 1, gender: 'ALL', altitudeMin: 0, rangeMin: 3.7, rangeMax: 6.0, criticalMin: 2.5, criticalMax: 7.0, unit: 'mEq/L' }),
  defaultRange({ loincCode: '2823-3', analyteName: 'Potassium', ageMin: 1, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 3.5, rangeMax: 5.1, criticalMin: 2.5, criticalMax: 7.0, unit: 'mEq/L' }),
]

// ---------------------------------------------------------------------------
// ALT/SGPT (LOINC 1742-6)
// ---------------------------------------------------------------------------

const ALT: ReferenceRange[] = [
  defaultRange({ loincCode: '1742-6', analyteName: 'ALT (SGPT)', ageMin: 0, ageMax: 18, gender: 'ALL', altitudeMin: 0, rangeMin: 7.0, rangeMax: 56.0, criticalMin: 0.0, criticalMax: 1000.0, unit: 'U/L' }),
  defaultRange({ loincCode: '1742-6', analyteName: 'ALT (SGPT)', ageMin: 18, ageMax: 999, gender: 'M', altitudeMin: 0, rangeMin: 7.0, rangeMax: 56.0, criticalMin: 0.0, criticalMax: 1000.0, unit: 'U/L' }),
  defaultRange({ loincCode: '1742-6', analyteName: 'ALT (SGPT)', ageMin: 18, ageMax: 999, gender: 'F', altitudeMin: 0, rangeMin: 7.0, rangeMax: 45.0, criticalMin: 0.0, criticalMax: 1000.0, unit: 'U/L' }),
]

// ---------------------------------------------------------------------------
// AST/SGOT (LOINC 1920-8)
// ---------------------------------------------------------------------------

const AST: ReferenceRange[] = [
  defaultRange({ loincCode: '1920-8', analyteName: 'AST (SGOT)', ageMin: 0, ageMax: 18, gender: 'ALL', altitudeMin: 0, rangeMin: 10.0, rangeMax: 40.0, criticalMin: 0.0, criticalMax: 1000.0, unit: 'U/L' }),
  defaultRange({ loincCode: '1920-8', analyteName: 'AST (SGOT)', ageMin: 18, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 10.0, rangeMax: 40.0, criticalMin: 0.0, criticalMax: 1000.0, unit: 'U/L' }),
]

// ---------------------------------------------------------------------------
// Total Bilirubin (LOINC 1975-2)
// ---------------------------------------------------------------------------

const BILIRUBIN: ReferenceRange[] = [
  // Neonates: higher physiological bilirubin is expected
  defaultRange({ loincCode: '1975-2', analyteName: 'Total Bilirubin', ageMin: 0, ageMax: 0.1, gender: 'ALL', altitudeMin: 0, rangeMin: 0.3, rangeMax: 12.0, criticalMin: 0.0, criticalMax: 25.0, unit: 'mg/dL' }),
  defaultRange({ loincCode: '1975-2', analyteName: 'Total Bilirubin', ageMin: 0.1, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 0.1, rangeMax: 1.2, criticalMin: 0.0, criticalMax: 20.0, unit: 'mg/dL' }),
]

// ---------------------------------------------------------------------------
// TSH (LOINC 3016-3)
// ---------------------------------------------------------------------------

const TSH: ReferenceRange[] = [
  defaultRange({ loincCode: '3016-3', analyteName: 'TSH', ageMin: 0, ageMax: 1, gender: 'ALL', altitudeMin: 0, rangeMin: 0.5, rangeMax: 6.0, criticalMin: 0.0, criticalMax: 50.0, unit: 'mIU/L' }),
  defaultRange({ loincCode: '3016-3', analyteName: 'TSH', ageMin: 1, ageMax: 5, gender: 'ALL', altitudeMin: 0, rangeMin: 0.6, rangeMax: 5.5, criticalMin: 0.0, criticalMax: 50.0, unit: 'mIU/L' }),
  defaultRange({ loincCode: '3016-3', analyteName: 'TSH', ageMin: 5, ageMax: 18, gender: 'ALL', altitudeMin: 0, rangeMin: 0.5, rangeMax: 4.5, criticalMin: 0.0, criticalMax: 50.0, unit: 'mIU/L' }),
  defaultRange({ loincCode: '3016-3', analyteName: 'TSH', ageMin: 18, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 0.4, rangeMax: 4.0, criticalMin: 0.0, criticalMax: 50.0, unit: 'mIU/L' }),
]

// ---------------------------------------------------------------------------
// HbA1c (LOINC 4548-4)
// ---------------------------------------------------------------------------

const HBAIC: ReferenceRange[] = [
  defaultRange({ loincCode: '4548-4', analyteName: 'HbA1c', ageMin: 0, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 4.0, rangeMax: 5.6, criticalMin: 2.0, criticalMax: 15.0, unit: '%' }),
]

// ---------------------------------------------------------------------------
// Urine specific gravity (LOINC 2965-2)
// ---------------------------------------------------------------------------

const URINE_SPECIFIC_GRAVITY: ReferenceRange[] = [
  defaultRange({ loincCode: '2965-2', analyteName: 'Urine Specific Gravity', ageMin: 0, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 1.001, rangeMax: 1.035, unit: '' }),
]

// ---------------------------------------------------------------------------
// Urine pH (LOINC 5767-9)
// ---------------------------------------------------------------------------

const URINE_PH: ReferenceRange[] = [
  defaultRange({ loincCode: '5767-9', analyteName: 'Urine pH', ageMin: 0, ageMax: 999, gender: 'ALL', altitudeMin: 0, rangeMin: 4.5, rangeMax: 8.0, unit: '' }),
]

// ---------------------------------------------------------------------------
// Urine Protein (LOINC 20454-5) — qualitative flagged as present/absent
// Included for completeness; flagging is handled via evaluateSelectFlag
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Aggregate exports
// ---------------------------------------------------------------------------

/**
 * All default reference ranges bundled with the app.
 * Keyed by LOINC code for fast lookup.
 */
export const DEFAULT_RANGES_BY_LOINC: Record<string, ReferenceRange[]> = {
  '718-7': HEMOGLOBIN,
  '4544-3': HEMATOCRIT,
  '6690-2': WBC,
  '777-3': PLATELETS,
  '1558-6': GLUCOSE_FASTING,
  '2160-0': CREATININE,
  '2951-2': SODIUM,
  '2823-3': POTASSIUM,
  '1742-6': ALT,
  '1920-8': AST,
  '1975-2': BILIRUBIN,
  '3016-3': TSH,
  '4548-4': HBAIC,
  '2965-2': URINE_SPECIFIC_GRAVITY,
  '5767-9': URINE_PH,
}

/** Flat array of all default ranges — useful for seeding or display. */
export const ALL_DEFAULT_RANGES: ReferenceRange[] = Object.values(DEFAULT_RANGES_BY_LOINC).flat()

/**
 * Predefined test categories mapped to LOINC codes.
 * Curated subset relevant to MENA primary care.
 *
 * This list will expand — stored as a typed array that can be
 * replaced with a Hub-fetched configuration in the future.
 *
 * Story 12.3 — AC 4, 5
 */

export interface LoincCategory {
  code: string
  label: string
}

export const LOINC_CATEGORIES: readonly LoincCategory[] = [
  { code: '58410-2', label: 'Blood Work \u2014 CBC' },
  { code: '57698-3', label: 'Lipid Panel' },
  { code: '4548-4', label: 'HbA1c' },
  { code: '51990-0', label: 'Basic Metabolic Panel' },
  { code: '24325-3', label: 'Liver Function Tests' },
  { code: '3016-3', label: 'Thyroid Function \u2014 TSH' },
  { code: '24356-8', label: 'Urinalysis' },
  { code: '1558-6', label: 'Blood Glucose \u2014 Fasting' },
] as const

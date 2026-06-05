// ---------------------------------------------------------------------------
// Story 50.1 — Afghan MoPH HMIS Template Specification
// Defines the canonical section layout, field order, and disease-to-LOINC
// mappings that match the Ministry of Public Health HMIS Form.
//
// LOINC mappings are configurable per installation. The defaults provided
// here cover standard test methods used in Afghan primary care laboratories.
// ---------------------------------------------------------------------------

/**
 * Maps a reportable disease to its associated LOINC test codes.
 * Each lab may use different test methods — this mapping is the default
 * and can be overridden via lab settings (future story).
 */
export interface ReportableDisease {
  code: string         // e.g., 'malaria'
  label: string        // Display label
  loincCodes: string[] // LOINC codes that map to this disease
}

/**
 * Default disease-to-LOINC mapping for Afghan MoPH HMIS reporting.
 *
 * Malaria: Rapid diagnostic test (RDT) + thick/thin smear microscopy
 * TB: AFB smear + GeneXpert MTB/RIF
 * Hepatitis B: HBsAg
 * Hepatitis C: Anti-HCV
 *
 * LOINC sources:
 *   24323-8 — Malaria rapid test (WHO LOINC mapping)
 *   5902-2  — Plasmodium thick smear microscopy
 *   58462-3 — AFB smear (TB sputum microscopy)
 *   91369-0 — GeneXpert MTB/RIF
 *   5196-1  — HBsAg (Hepatitis B surface antigen)
 *   16935-9 — Anti-HCV (Hepatitis C antibody)
 */
export const REPORTABLE_DISEASE_LOINC_MAP: ReportableDisease[] = [
  {
    code: 'malaria',
    label: 'Malaria',
    loincCodes: ['24323-8', '5902-2', '51587-4'],
  },
  {
    code: 'tb',
    label: 'Tuberculosis (TB)',
    loincCodes: ['58462-3', '91369-0', '91376-5'],
  },
  {
    code: 'hep_b',
    label: 'Hepatitis B',
    loincCodes: ['5196-1', '22322-2'],
  },
  {
    code: 'hep_c',
    label: 'Hepatitis C',
    loincCodes: ['16935-9', '13955-0'],
  },
]

/**
 * HMIS template section definitions.
 * Matches the Afghan MoPH HMIS Form layout exactly.
 */
export interface HmisSection {
  code: string
  titleKey: string        // i18n key in hmisReport namespace
  description: string
}

export const HMIS_SECTIONS: HmisSection[] = [
  {
    code: 'A',
    titleKey: 'sectionA',
    description: 'Facility Information — lab name, province, district, reporting period',
  },
  {
    code: 'B',
    titleKey: 'sectionB',
    description: 'Test Volume Summary — total performed, positive, negative, positivity rate per category',
  },
  {
    code: 'C',
    titleKey: 'sectionC',
    description: 'Reportable Disease Surveillance — malaria, TB, hepatitis: tested, positive, rate, vs. previous month',
  },
  {
    code: 'D',
    titleKey: 'sectionD',
    description: 'Demographic Distribution — age group rows × gender columns',
  },
  {
    code: 'E',
    titleKey: 'sectionE',
    description: 'Reagent & Supply Consumption — reagent name, consumed, remaining, days of stock',
  },
  {
    code: 'F',
    titleKey: 'sectionF',
    description: 'Quality Indicators — rejected samples, rejection rate, QC pass rate, average TAT',
  },
]

/** Month names in English — used in PDF and report titles. */
export const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Format a reporting period label. */
export function formatReportingPeriod(year: number, month: number): string {
  const name = (month >= 1 && month <= 12) ? MONTH_NAMES_EN[month - 1] : `Month ${month}`
  return `${name} ${year}`
}

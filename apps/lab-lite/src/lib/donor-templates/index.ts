// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report Template Registry
// Maps program template codes to pre-built DonorReportTemplate objects.
// New templates: create a file in this directory and register it here.
// No database read needed for pre-built templates — they ship with the app.
// ---------------------------------------------------------------------------

import type { DonorReportTemplate } from '@/lib/donor-types'
import { WHO_TB_TEMPLATE, WHO_TB_LOINC_CODES } from './who-tb'
import { MSF_MALARIA_TEMPLATE, MSF_MALARIA_LOINC_CODES } from './msf-malaria'
import { USAID_HEP_TEMPLATE, USAID_HEP_LOINC_CODES } from './usaid-hepatitis'

// Template registry: templateCode → DonorReportTemplate
const BUILT_IN_TEMPLATE_REGISTRY: Record<string, DonorReportTemplate> = {
  [WHO_TB_TEMPLATE.templateCode]: WHO_TB_TEMPLATE,
  [MSF_MALARIA_TEMPLATE.templateCode]: MSF_MALARIA_TEMPLATE,
  [USAID_HEP_TEMPLATE.templateCode]: USAID_HEP_TEMPLATE,
}

// LOINC codes per template (for auto-tagging UI to show suggested programs)
export const TEMPLATE_LOINC_MAP: Record<string, string[]> = {
  [WHO_TB_TEMPLATE.templateCode]: WHO_TB_LOINC_CODES,
  [MSF_MALARIA_TEMPLATE.templateCode]: MSF_MALARIA_LOINC_CODES,
  [USAID_HEP_TEMPLATE.templateCode]: USAID_HEP_LOINC_CODES,
}

// Pre-built program defaults (used in "Add Program" flow to pre-fill form)
export interface ProgramDefault {
  programCode: string
  programName: string
  donorOrganization: string
  templateCode: string
  loincCodes: string[]
}

export const BUILT_IN_PROGRAM_DEFAULTS: ProgramDefault[] = [
  {
    programCode: 'WHO_TB',
    programName: 'WHO TB Program',
    donorOrganization: 'World Health Organization',
    templateCode: WHO_TB_TEMPLATE.templateCode,
    loincCodes: WHO_TB_LOINC_CODES,
  },
  {
    programCode: 'MSF_MALARIA',
    programName: 'MSF Malaria Program',
    donorOrganization: 'Médecins Sans Frontières (MSF)',
    templateCode: MSF_MALARIA_TEMPLATE.templateCode,
    loincCodes: MSF_MALARIA_LOINC_CODES,
  },
  {
    programCode: 'USAID_HEP',
    programName: 'USAID Hepatitis Program',
    donorOrganization: 'United States Agency for International Development (USAID)',
    templateCode: USAID_HEP_TEMPLATE.templateCode,
    loincCodes: USAID_HEP_LOINC_CODES,
  },
]

/**
 * Look up a pre-built template by templateCode.
 * Returns undefined if code does not match a built-in template.
 * For custom templates stored in Dexie, use getCustomDonorTemplates() from db.ts.
 */
export function getBuiltInTemplate(templateCode: string): DonorReportTemplate | undefined {
  return BUILT_IN_TEMPLATE_REGISTRY[templateCode]
}

/**
 * Resolve a template by code — checks built-in registry first.
 * Accepts an optional array of custom templates from Dexie as fallback.
 */
export function resolveTemplate(
  templateCode: string,
  customTemplates: DonorReportTemplate[] = [],
): DonorReportTemplate | undefined {
  return BUILT_IN_TEMPLATE_REGISTRY[templateCode]
    ?? customTemplates.find((t) => t.templateCode === templateCode)
}

/** Return all built-in templates as an array (for the Add Program selector). */
export function getAllBuiltInTemplates(): DonorReportTemplate[] {
  return Object.values(BUILT_IN_TEMPLATE_REGISTRY)
}

export {
  WHO_TB_TEMPLATE,
  MSF_MALARIA_TEMPLATE,
  USAID_HEP_TEMPLATE,
  WHO_TB_LOINC_CODES,
  MSF_MALARIA_LOINC_CODES,
  USAID_HEP_LOINC_CODES,
}

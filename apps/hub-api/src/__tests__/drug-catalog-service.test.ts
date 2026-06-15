import { describe, it, expect } from 'vitest'
import {
  getTierForRole,
  scopeEntryToTier,
  ETL_PROTECTED_FIELDS,
  ENRICHMENT_FIELDS_BY_ROLE,
} from '@/services/drug-catalog.service'

const FULL_ROW = {
  atc_code: 'J01CA04',
  rxnorm_cui: '723',
  inn_name: 'Amoxicillin',
  brand_names: ['Amoxil'],
  dose_forms: ['capsule', 'suspension'],
  therapeutic_class: 'Aminopenicillin antibiotic',
  local_names: { prs: 'آموکسیسیلین' },
  summary_plain: { en: 'An antibiotic for bacterial infections.' },
  used_for: [{ en: 'Chest infection' }],
  common_side_effects: [{ en: 'Nausea' }],
  when_to_seek_help: { en: 'Seek help if rash is severe.' },
  storage_instructions: { en: 'Store below 25°C.' },
  pregnancy_summary_plain: { en: 'Use with caution.' },
  warnings_summary_plain: { en: 'Penicillin allergy risk.' },
  mechanism_of_action: 'Inhibits cell wall synthesis.',
  indications_clinical: ['J06.9'],
  adult_dosing: [{ indication: 'CAP', adultDose: '500mg', frequency: 'TDS' }],
  pediatric_dosing: [{ indication: 'AOM', pediatricDose: '80mg/kg/day', frequency: 'BD' }],
  renal_adjustment: 'CrCl <30: reduce dose',
  adverse_events: [{ effect: 'Diarrhoea', frequency: 'common', severity: 'mild' }],
  contraindications: ['Penicillin hypersensitivity'],
  interactions: [{ drugAtcCode: 'B01AA03', drugName: 'Warfarin', severity: 'MODERATE', mechanism: 'CYP2C9' }],
  pregnancy_category: 'B',
  administration_notes: { en: 'Take with food.' },
  pharmacokinetics: { halfLifeHours: 1.3 },
  formulary_status: 'on_formulary',
  dispensing_notes: 'Dispense with water.',
  substitutes: ['J01CA01'],
  recall_alerts: [],
  unit_cost: 3.2,
  version: 1718000000000,
  last_updated: '2026-06-12T00:00:00Z',
}

describe('getTierForRole', () => {
  it('returns pharmacist for PHARMACIST role', () => {
    expect(getTierForRole('PHARMACIST')).toBe('pharmacist')
  })

  it('returns pharmacist for ADMIN role', () => {
    expect(getTierForRole('ADMIN')).toBe('pharmacist')
  })

  it('returns clinical for DOCTOR role', () => {
    expect(getTierForRole('DOCTOR')).toBe('clinical')
  })

  it('returns clinical for NURSE role', () => {
    expect(getTierForRole('NURSE')).toBe('clinical')
  })

  it('returns clinical for LAB_TECH role', () => {
    expect(getTierForRole('LAB_TECH')).toBe('clinical')
  })

  it('returns public for PATIENT role', () => {
    expect(getTierForRole('PATIENT')).toBe('public')
  })

  it('returns public for unknown role', () => {
    expect(getTierForRole('UNKNOWN')).toBe('public')
  })
})

describe('scopeEntryToTier', () => {
  it('returns only tier-1 fields for PATIENT role', () => {
    const result = scopeEntryToTier(FULL_ROW, 'PATIENT')
    expect(result.atcCode).toBe('J01CA04')
    expect(result.innName).toBe('Amoxicillin')
    expect(result.summaryPlain).toEqual({ en: 'An antibiotic for bacterial infections.' })
    // Tier 2 fields must be absent
    expect((result as Record<string, unknown>).mechanismOfAction).toBeUndefined()
    expect((result as Record<string, unknown>).adultDosing).toBeUndefined()
    expect((result as Record<string, unknown>).interactions).toBeUndefined()
    // Tier 3 fields must be absent
    expect((result as Record<string, unknown>).formularyStatus).toBeUndefined()
    expect((result as Record<string, unknown>).unitCost).toBeUndefined()
  })

  it('returns tier-1 + tier-2 fields for DOCTOR role', () => {
    const result = scopeEntryToTier(FULL_ROW, 'DOCTOR') as Record<string, unknown>
    expect(result.atcCode).toBe('J01CA04')
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.adultDosing).toBeDefined()
    expect(result.interactions).toBeDefined()
    // Tier 3 must be absent
    expect(result.formularyStatus).toBeUndefined()
    expect(result.unitCost).toBeUndefined()
  })

  it('returns all tiers for PHARMACIST role', () => {
    const result = scopeEntryToTier(FULL_ROW, 'PHARMACIST') as Record<string, unknown>
    expect(result.atcCode).toBe('J01CA04')
    expect(result.mechanismOfAction).toBe('Inhibits cell wall synthesis.')
    expect(result.formularyStatus).toBe('on_formulary')
    expect(result.unitCost).toBe(3.2)
    expect(result.substitutes).toEqual(['J01CA01'])
  })

  it('includes localNames and version in all tiers', () => {
    for (const role of ['PATIENT', 'DOCTOR', 'PHARMACIST'] as const) {
      const result = scopeEntryToTier(FULL_ROW, role)
      expect(result.localNames).toEqual({ prs: 'آموکسیسیلین' })
      expect(result.version).toBe(1718000000000)
    }
  })
})

describe('ETL_PROTECTED_FIELDS', () => {
  it('includes inn_name', () => {
    expect(ETL_PROTECTED_FIELDS.has('inn_name')).toBe(true)
  })

  it('includes interactions', () => {
    expect(ETL_PROTECTED_FIELDS.has('interactions')).toBe(true)
  })

  it('does NOT include local_names (enrichment)', () => {
    expect(ETL_PROTECTED_FIELDS.has('local_names')).toBe(false)
  })

  it('does NOT include formulary_status (enrichment)', () => {
    expect(ETL_PROTECTED_FIELDS.has('formulary_status')).toBe(false)
  })
})

describe('ENRICHMENT_FIELDS_BY_ROLE', () => {
  it('clinical role can only set local_names', () => {
    expect(ENRICHMENT_FIELDS_BY_ROLE.clinical.has('local_names')).toBe(true)
    expect(ENRICHMENT_FIELDS_BY_ROLE.clinical.has('formulary_status')).toBe(false)
    expect(ENRICHMENT_FIELDS_BY_ROLE.clinical.has('unit_cost')).toBe(false)
  })

  it('pharmacist role can set all enrichment fields', () => {
    for (const field of ['local_names', 'dispensing_notes', 'formulary_status', 'unit_cost']) {
      expect(ENRICHMENT_FIELDS_BY_ROLE.pharmacist.has(field)).toBe(true)
    }
  })
})

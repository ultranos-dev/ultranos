import { describe, it, expect, vi } from 'vitest'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', textSecondary: '#444', border: '#ddd', surfaceSubtle: '#f5f5f5', textMuted: '#999',
    successLight: '#f0fdf4', successDark: '#14532d', dangerLight: '#fef2f2', dangerDark: '#991b1b',
    warningLight: '#fffbeb', warningDark: '#92400e', warning: '#d97706', primary500: '#2e9e71',
  }),
}))
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))
vi.mock('@/components/DrugDetail/SectionCard', () => ({ SectionCard: () => null }))
vi.mock('@/components/DrugDetail/MediaSection', () => ({ MediaSection: () => null }))
vi.mock('@/components/DrugDetail/FormularySection', () => ({ FormularySection: () => null }))

const tMap: Record<string, string> = {
  'drug.sections.about': 'About this medicine',
  'drug.sections.dosageIndications': 'Dosage & Indications',
  'drug.sections.adverseEffects': 'Adverse Effects',
  'drug.sections.pharmacology': 'Pharmacology',
  'drug.sections.administration': 'Administration',
  'drug.sections.formulary': 'Formulary',
  'drug.sections.pricing': 'Pricing & Savings',
  'drug.overview.usedFor': 'Used for',
  'drug.overview.warnings': 'Warnings',
  'drug.overview.sideEffects': 'Common side effects',
  'drug.overview.pregnancy': 'Pregnancy',
  'drug.overview.storage': 'Storage',
  'drug.overview.brandNames': 'Brand names',
  'drug.overview.doseForms': 'Dose forms',
  'drug.clinical.interactions': 'Interactions',
}
const t = (k: string) => tMap[k] ?? k

const base: DrugEntryTier1 = {
  atcCode: 'M01AE01', innName: 'Ibuprofen', brandNames: ['Advil'], doseForms: ['Tablet'],
  therapeuticClass: 'NSAID', localNames: {},
  summaryPlain: { en: 'A painkiller.' }, usedFor: [{ en: 'Pain' }], commonSideEffects: [],
  whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {}, warningsSummaryPlain: {},
  version: 1, lastUpdated: '2026-06-17T00:00:00Z',
}

describe('buildDrugSections — patient (plain language)', () => {
  it('opens About + Used for, omits empty sections', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('about')
    expect(ids).toContain('usedFor')
    expect(ids).toContain('formsBrands')
    expect(ids).not.toContain('sideEffects')
    expect(ids).not.toContain('warnings')
    expect(ids).not.toContain('photos')
    expect(secs.find((s) => s.id === 'about')!.defaultOpen).toBe(false)
    expect(secs.find((s) => s.id === 'usedFor')!.defaultOpen).toBe(false)
    expect(secs.find((s) => s.id === 'formsBrands')!.defaultOpen).toBe(false)
  })

  it('uses i18n labels for section titles', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    expect(secs.find((s) => s.id === 'about')!.title).toBe('About this medicine')
    expect(secs.find((s) => s.id === 'usedFor')!.title).toBe('Used for')
  })

  it('shows a Warnings section when warnings text exists', () => {
    const entry = { ...base, warningsSummaryPlain: { en: 'May cause bleeding' } }
    const secs = buildDrugSections({ entry, lang: 'en', t, isClinical: false, isPharmacist: false })
    expect(secs.map((s) => s.id)).toContain('warnings')
  })

  it('always appends pricing and never shows clinical sections for patients', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('pricing')
    expect(ids).not.toContain('dosageIndications')
    expect(ids).not.toContain('pharmacology')
  })
})

describe('buildDrugSections — clinical/pharmacist (monograph)', () => {
  const clinicalBase = {
    ...base, summaryPlain: {}, usedFor: [],
    mechanismOfAction: 'Inhibits COX', indicationsClinical: ['Pain', 'Fever'],
    adultDosing: [{ indication: 'Pain', adultDose: '400mg', frequency: 'TID', route: 'PO' }],
    pediatricDosing: [], adverseEvents: [{ effect: 'Nausea', frequency: 'common', severity: 'mild' }],
    contraindications: [], interactions: [{ drugAtcCode: 'X', drugName: 'Warfarin', severity: 'MAJOR', mechanism: 'bleeding' }],
    renalAdjustment: undefined, pregnancyClinical: { legacyCategory: 'C' }, administrationNotes: {},
    pharmacokinetics: { halfLife: '2 hours' },
  } as unknown as DrugEntryTier2

  it('produces Medscape-style monograph sections', () => {
    const secs = buildDrugSections({ entry: clinicalBase, lang: 'en', t, isClinical: true, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('dosageIndications')
    expect(ids).toContain('interactions')
    expect(ids).toContain('adverseEffects')
    expect(ids).toContain('pharmacology')
    expect(ids).toContain('pricing')
    expect(ids).not.toContain('about')      // plain-language not used for clinical
    expect(ids).not.toContain('formulary')  // not pharmacist
    expect(secs.find((s) => s.id === 'dosageIndications')!.defaultOpen).toBe(false)
  })

  it('adds Formulary for pharmacist when formulary data exists', () => {
    const e3 = { ...clinicalBase, formularyStatus: 'on_formulary', dispensingNotes: '', substitutes: [], recallAlerts: [] } as unknown as DrugEntryTier3
    const secs = buildDrugSections({ entry: e3, lang: 'en', t, isClinical: true, isPharmacist: true })
    expect(secs.map((s) => s.id)).toContain('formulary')
  })

  it('omits Formulary when pharmacist but no formulary data', () => {
    const e3 = { ...clinicalBase, formularyStatus: undefined, dispensingNotes: undefined, substitutes: [], recallAlerts: [] } as unknown as DrugEntryTier3
    const secs = buildDrugSections({ entry: e3, lang: 'en', t, isClinical: true, isPharmacist: true })
    expect(secs.map((s) => s.id)).not.toContain('formulary')
  })

  it('omits all monograph sections when clinical entry has no clinical content', () => {
    const empty = {
      ...base, summaryPlain: {}, usedFor: [], brandNames: [], doseForms: [], commonSideEffects: [],
      warningsSummaryPlain: {}, pregnancySummaryPlain: {}, storageInstructions: {},
      mechanismOfAction: undefined, indicationsClinical: [], adultDosing: [], pediatricDosing: [],
      adverseEvents: [], interactions: [], renalAdjustment: undefined, pregnancyClinical: undefined,
      pharmacokinetics: {}, administrationNotes: {},
    } as unknown as DrugEntryTier2
    const secs = buildDrugSections({ entry: empty, lang: 'en', t, isClinical: true, isPharmacist: false })
    expect(secs.map((s) => s.id)).toEqual(['pricing'])
  })
})

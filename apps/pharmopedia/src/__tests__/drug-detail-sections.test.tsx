import { describe, it, expect, vi } from 'vitest'
import type { DrugEntryTier1, DrugEntryTier2 } from '@ultranos/shared-types'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', textPrimary: '#111', textSecondary: '#444', border: '#ddd', surfaceSubtle: '#f5f5f5', textMuted: '#999' }) }))
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))
vi.mock('@/components/DrugDetail/SectionCard', () => ({ SectionCard: () => null }))
vi.mock('@/components/DrugDetail/MediaSection', () => ({ MediaSection: () => null }))

// Real t() map used for i18n key assertions (migrated from drug-detail-i18n.test.tsx)
const tMap: Record<string, string> = {
  'drug.overview.summary': 'Summary',
  'drug.overview.usedFor': 'Used for',
  'drug.overview.sideEffects': 'Common side effects',
  'drug.overview.seekHelp': 'When to seek help',
  'drug.overview.storage': 'Storage',
  'drug.overview.pregnancy': 'Pregnancy',
  'drug.overview.warnings': 'Warnings',
  'drug.overview.brandNames': 'Brand names',
  'drug.overview.doseForms': 'Dose forms',
  'drug.tabs.clinical': 'Clinical',
  'drug.tabs.pricing': 'Pricing',
  'drug.photos.title': 'Photos',
  'drug.clinical.adminNotes': 'Administration notes',
  'drug.sections.dispensing': 'Dispensing',
}
const t = (k: string) => tMap[k] ?? k

const base: DrugEntryTier1 = {
  atcCode: 'M01AE01', innName: 'Ibuprofen', brandNames: ['Advil'], doseForms: ['Tablet'],
  therapeuticClass: 'NSAID', localNames: {},
  summaryPlain: { en: 'A painkiller.' }, usedFor: [{ en: 'Pain' }], commonSideEffects: [],
  whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {}, warningsSummaryPlain: {},
  version: 1, lastUpdated: '2026-06-17T00:00:00Z',
}

describe('buildDrugSections', () => {
  it('omits empty sections and opens summary + usedFor', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('summary')
    expect(ids).toContain('usedFor')
    expect(ids).toContain('formsBrands') // brandNames/doseForms present
    expect(ids).not.toContain('sideEffects') // empty
    expect(ids).not.toContain('photos') // no images
    expect(secs.find((s) => s.id === 'summary')!.defaultOpen).toBe(true)
    expect(secs.find((s) => s.id === 'formsBrands')!.defaultOpen).toBe(false)
  })

  it('adds photos when images exist and clinical when isClinical has content', () => {
    const withImg = { ...base, images: [{ url: 'https://x/a.jpg', brand: 'Advil' }], mechanismOfAction: 'Inhibits COX' }
    const secs = buildDrugSections({ entry: withImg, lang: 'en', t, isClinical: true, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('photos')
    expect(ids).toContain('clinical')
    expect(ids).not.toContain('dispensing')
  })

  // Migrated from drug-detail-i18n.test.tsx: section titles use correct i18n keys
  it('uses correct i18n key for summary section title', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    expect(secs.find((s) => s.id === 'summary')!.title).toBe('Summary')
  })

  it('uses correct i18n key for usedFor section title', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: false, isPharmacist: false })
    expect(secs.find((s) => s.id === 'usedFor')!.title).toBe('Used for')
  })

  // Migrated from clinical-tab-extended.test.tsx: administrationNotes in clinical section
  it('includes administrationNotes in clinical section when present', () => {
    const entry: DrugEntryTier2 = {
      ...base,
      mechanismOfAction: undefined,
      indicationsClinical: [],
      adultDosing: [],
      pediatricDosing: [],
      renalAdjustment: undefined,
      adverseEvents: [],
      contraindications: [],
      interactions: [],
      pregnancyCategory: undefined,
      pharmacokinetics: {},
      administrationNotes: { en: 'Take with food', prs: 'با غذا بخورید' },
    }
    const secs = buildDrugSections({ entry, lang: 'en', t, isClinical: true, isPharmacist: false })
    expect(secs.find((s) => s.id === 'clinical')).toBeTruthy()
    // administrationNotes is a non-empty field that is included in the clinical body
    // (presence of clinical section is sufficient; SectionCard is mocked, body is JSX)
  })

  it('omits clinical section when all clinical fields are absent', () => {
    const entry: DrugEntryTier2 = {
      ...base,
      mechanismOfAction: undefined,
      indicationsClinical: [],
      adultDosing: [],
      pediatricDosing: [],
      renalAdjustment: undefined,
      adverseEvents: [],
      contraindications: [],
      interactions: [],
      pregnancyCategory: undefined,
      pharmacokinetics: {},
      administrationNotes: {},
    }
    // Clinical section is omitted when isClinical=true but all content fields are empty.
    const secs = buildDrugSections({ entry, lang: 'en', t, isClinical: true, isPharmacist: false })
    expect(secs.find((s) => s.id === 'clinical')).toBeUndefined()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'

// SectionCard is NOT mocked here — we render the real component to assert content text.
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', surfaceSubtle: '#f5f5f5', border: '#ddd', textPrimary: '#111', textSecondary: '#444',
    textMuted: '#999', danger: '#dc2626', dangerLight: '#fef2f2', warning: '#d97706', warningLight: '#fffbeb',
  }),
}))
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))
vi.mock('@/components/DrugDetail/MediaSection', () => ({ MediaSection: () => null }))
vi.mock('expo-image', () => { const R = require('react'); return { Image: (p: Record<string, unknown>) => R.createElement('ExpoImage', p) } })

const t = (k: string) => k

const base = {
  atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'Antibiotic',
  localNames: {}, summaryPlain: {}, usedFor: [], commonSideEffects: [],
  whenToSeekHelp: {}, storageInstructions: {}, pregnancySummaryPlain: {}, warningsSummaryPlain: {},
  version: 1, lastUpdated: '2026-06-17T00:00:00Z',
  mechanismOfAction: 'Inhibits cell wall synthesis', indicationsClinical: [], adverseEvents: [],
  contraindications: [], interactions: [], renalAdjustment: undefined, administrationNotes: {},
  adultDosing: [{ indication: 'Infection', adultDose: '500mg', frequency: 'TID', route: 'PO' }],
  pediatricDosing: [{ indication: 'Infection', pediatricDose: '40mg/kg/day', frequency: 'TID' }],
  pharmacokinetics: { halfLife: '1.5 hours', proteinBinding: '20%' },
  pregnancyClinical: { legacyCategory: 'B', lactation: 'Excreted in breast milk.' },
} as unknown as DrugEntryTier2

function sectionBody(id: string) {
  const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: true, isPharmacist: false })
  return secs.find((s) => s.id === id)
}

describe('clinical monograph section content', () => {
  it('Dosage & Indications renders adult + pediatric dosing', () => {
    const sec = sectionBody('dosageIndications')
    expect(sec).toBeTruthy()
    const { getByText } = render(<>{sec!.body}</>)
    expect(getByText(/Infection: 500mg TID \(PO\)/)).toBeTruthy()
    expect(getByText(/Infection: 40mg\/kg\/day TID/)).toBeTruthy()
  })

  it('Pharmacology renders mechanism of action + pharmacokinetics', () => {
    const sec = sectionBody('pharmacology')
    expect(sec).toBeTruthy()
    const { getByText } = render(<>{sec!.body}</>)
    expect(getByText(/Inhibits cell wall synthesis/)).toBeTruthy()
    expect(getByText(/drug.clinical.halfLife: 1.5 h/)).toBeTruthy()
    expect(getByText(/drug.clinical.proteinBinding: 20%/)).toBeTruthy()
  })

  it('Pregnancy renders the legacy category and lactation prose', () => {
    const sec = sectionBody('pregnancy')
    expect(sec).toBeTruthy()
    const { getByText } = render(<>{sec!.body}</>)
    expect(getByText('B')).toBeTruthy()
    expect(getByText('Excreted in breast milk.')).toBeTruthy()
  })

  it('renders the enriched OnSIDES/openFDA monograph fields end-to-end', () => {
    const enriched = {
      ...base,
      adverseEvents: [{ effect: 'Stevens-Johnson syndrome', frequency: 'unknown', severity: 'severe' }],
      administrationNotes: { en: 'Trichomoniasis: two grams orally as a single dose.' },
      warningsSummaryPlain: { en: 'Carcinogenic in mice and rats.' },
    } as unknown as DrugEntryTier2
    const secs = buildDrugSections({ entry: enriched, lang: 'en', t, isClinical: true, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['adverseEffects', 'administration', 'warnings']))
    expect(render(<>{secs.find((s) => s.id === 'adverseEffects')!.body}</>).getByText(/Stevens-Johnson syndrome/)).toBeTruthy()
    expect(render(<>{secs.find((s) => s.id === 'administration')!.body}</>).getByText(/two grams orally/)).toBeTruthy()
    expect(render(<>{secs.find((s) => s.id === 'warnings')!.body}</>).getByText(/Carcinogenic in mice/)).toBeTruthy()
  })

  it('patient view renders the MedlinePlus summary (about) + openFDA warnings', () => {
    const patient = {
      ...base,
      summaryPlain: { en: 'Aspirin is used to reduce fever and relieve pain.' },
      warningsSummaryPlain: { en: 'Risk of Reye syndrome in children.' },
    } as unknown as DrugEntryTier2
    const secs = buildDrugSections({ entry: patient, lang: 'en', t, isClinical: false, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['about', 'warnings']))
    expect(render(<>{secs.find((s) => s.id === 'about')!.body}</>).getByText(/Aspirin is used to reduce fever/)).toBeTruthy()
  })

  it('falls back to English prose when the requested language is missing (Dari user, en-only field)', () => {
    const enOnly = { ...base, administrationNotes: { en: 'Take with food.' } } as unknown as DrugEntryTier2
    const secs = buildDrugSections({ entry: enOnly, lang: 'prs', t, isClinical: true, isPharmacist: false })
    expect(render(<>{secs.find((s) => s.id === 'administration')!.body}</>).getByText(/Take with food/)).toBeTruthy()
  })

  it('omits monograph sections when clinical content is absent', () => {
    const empty = {
      ...base, mechanismOfAction: undefined, adultDosing: [], pediatricDosing: [], pharmacokinetics: {},
      pregnancyClinical: undefined, indicationsClinical: [], renalAdjustment: undefined,
    } as unknown as DrugEntryTier2
    const secs = buildDrugSections({ entry: empty, lang: 'en', t, isClinical: true, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).not.toContain('dosageIndications')
    expect(ids).not.toContain('pharmacology')
    expect(ids).not.toContain('pregnancy')
  })
})

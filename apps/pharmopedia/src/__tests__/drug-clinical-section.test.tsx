import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', surfaceSubtle: '#f5f5f5', border: '#ddd',
    textPrimary: '#111', textSecondary: '#444', textMuted: '#999',
    danger: '#dc2626', dangerLight: '#fef2f2', warning: '#d97706', warningLight: '#fffbeb',
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
  pharmacokinetics: { halfLifeHours: 1.5, proteinBindingPct: 20 },
  pregnancyCategory: 'B',
} as unknown as DrugEntryTier2

describe('clinical section parity', () => {
  it('renders adult + pediatric dosing, pharmacokinetics, and pregnancy category', () => {
    const secs = buildDrugSections({ entry: base, lang: 'en', t, isClinical: true, isPharmacist: false })
    const clinical = secs.find((s) => s.id === 'clinical')
    expect(clinical).toBeTruthy()
    const { getByText } = render(<>{clinical!.body}</>)
    expect(getByText(/Infection: 500mg TID \(PO\)/)).toBeTruthy()
    expect(getByText(/Infection: 40mg\/kg\/day TID/)).toBeTruthy()
    expect(getByText(/drug.clinical.halfLife: 1.5 h/)).toBeTruthy()
    expect(getByText(/drug.clinical.proteinBinding: 20%/)).toBeTruthy()
    expect(getByText('B')).toBeTruthy()
  })

  it('omits the clinical section entirely when there is no clinical content', () => {
    const empty = {
      ...base, mechanismOfAction: undefined, indicationsClinical: [], adverseEvents: [],
      adultDosing: [], pediatricDosing: [], pharmacokinetics: {}, renalAdjustment: undefined,
      pregnancyCategory: undefined, administrationNotes: {},
    } as unknown as DrugEntryTier2
    const secs = buildDrugSections({ entry: empty, lang: 'en', t, isClinical: true, isPharmacist: false })
    expect(secs.find((s) => s.id === 'clinical')).toBeUndefined()
  })
})

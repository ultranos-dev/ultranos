import { describe, it, expect, vi } from 'vitest'
import type { DrugEntryTier1 } from '@ultranos/shared-types'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'

vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({ surface: '#fff', textPrimary: '#111', textSecondary: '#444', border: '#ddd', surfaceSubtle: '#f5f5f5', textMuted: '#999' }) }))
vi.mock('@/components/DrugDetail/PricingTab', () => ({ PricingTab: () => null }))
vi.mock('@/components/DrugDetail/SectionCard', () => ({ SectionCard: () => null }))
vi.mock('@/components/DrugDetail/MediaSection', () => ({ MediaSection: () => null }))

const t = (k: string) => k
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

  it('adds photos when images exist and clinical when isClinical', () => {
    const withImg = { ...base, images: [{ url: 'https://x/a.jpg', brand: 'Advil' }] }
    const secs = buildDrugSections({ entry: withImg, lang: 'en', t, isClinical: true, isPharmacist: false })
    const ids = secs.map((s) => s.id)
    expect(ids).toContain('photos')
    expect(ids).toContain('clinical')
    expect(ids).not.toContain('dispensing')
  })
})

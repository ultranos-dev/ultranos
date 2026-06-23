import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { BrandsSection } from '@/components/DrugDetail/BrandsSection'
import type { DrugBrandWithPresentations } from '@ultranos/shared-types'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', surfaceSubtle: '#f5f5f5', border: '#e5e7eb', borderSubtle: '#eee',
    textPrimary: '#111', textSecondary: '#555', textMuted: '#999', primary500: '#2e9e71', primary50: '#edfaf4', primary700: '#1c6248',
  }),
}))
vi.mock('@/store/lang-store', () => ({ isRtlLang: (l: string) => ['ar', 'prs', 'ps'].includes(l) }))
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return { Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) => React.createElement(View, { testID }, children) }
})

const t = (k: string) => ({
  'drug.brands.manufacturer': 'Manufacturer',
  'drug.brands.referencePrice': 'Reference price',
  'drug.brands.rx': 'Prescription only',
  'drug.brands.otc': 'Over the counter',
}[k] ?? k)

const BRANDS: DrugBrandWithPresentations[] = [
  {
    id: 'b1', genericAtcCode: 'J01CR02', brandName: 'Augmentin', manufacturer: 'GSK',
    brandNameLocal: {}, rxStatus: 'rx', version: 1, lastUpdated: '',
    presentations: [
      { id: 'p1', brandId: 'b1', strength: '625 mg', doseForm: 'tablet', packSize: 14, packUnit: 'tablets', registrationStatus: 'marketed', referencePrice: 12.5, currency: 'AFN', version: 1, lastUpdated: '' },
    ],
  },
  {
    id: 'b2', genericAtcCode: 'J01CR02', brandName: 'Curam', brandNameLocal: {}, rxStatus: 'unknown', version: 1, lastUpdated: '',
    presentations: [],
  },
]

describe('BrandsSection', () => {
  it('renders each brand with its manufacturer', () => {
    render(<BrandsSection brands={BRANDS} lang="en" t={t} />)
    expect(screen.getByTestId('brand-row-b1')).toBeTruthy()
    expect(screen.getByText('Augmentin')).toBeTruthy()
    expect(screen.getByText('Manufacturer: GSK')).toBeTruthy()
  })

  it('renders a presentation line with strength, pack and reference price', () => {
    render(<BrandsSection brands={BRANDS} lang="en" t={t} />)
    const line = screen.getByTestId('presentation-p1').props.children
    const text = Array.isArray(line) ? line.join('') : String(line)
    expect(text).toContain('625 mg')
    expect(text).toContain('14 tablets')
    expect(text).toContain('12.5')
    expect(text).toContain('AFN')
  })

  it('renders a brand with no presentations without crashing', () => {
    render(<BrandsSection brands={BRANDS} lang="en" t={t} />)
    expect(screen.getByTestId('brand-row-b2')).toBeTruthy()
    expect(screen.getByText('Curam')).toBeTruthy()
  })

  it('matches snapshot (LTR)', () => {
    const { toJSON } = render(<BrandsSection brands={BRANDS} lang="en" t={t} />)
    expect(toJSON()).toMatchSnapshot()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SearchResults } from '@/components/SearchResults'
import type { DrugSearchResult, BrandSearchResult } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ isRtlLang: () => false }))
vi.mock('@/components/DrugCard', () => {
  const React = require('react'); const { Text } = require('react-native')
  return { DrugCard: ({ result }: { result: DrugSearchResult }) => React.createElement(Text, { testID: `drug-card-${result.atcCode}` }, result.innName) }
})
vi.mock('@/components/BrandResultCard', () => {
  const React = require('react'); const { Text } = require('react-native')
  return { BrandResultCard: ({ result }: { result: BrandSearchResult }) => React.createElement(Text, { testID: `brand-result-${result.id}` }, result.brandName) }
})
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react'); const { Pressable, Text, View } = require('react-native')
  return {
    Chip: ({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) =>
      React.createElement(Pressable, { testID, onPress, accessibilityState: { selected } }, React.createElement(Text, null, label)),
    EmptyState: ({ title }: { title: string }) => React.createElement(View, { testID: 'empty' }, React.createElement(Text, null, title)),
  }
})

const generics: DrugSearchResult[] = [{ atcCode: 'J01MA02', innName: 'Ciprofloxacin', brandNames: [], doseForms: [], therapeuticClass: '' }]
const brands: BrandSearchResult[] = [
  { id: 'b1', brandName: 'SNOCIP', genericAtcCode: 'J01MA02', genericInnName: 'Ciprofloxacin' },
  { id: 'b2', brandName: 'Cipromin', genericAtcCode: 'J01MA02', genericInnName: 'Ciprofloxacin' },
]

function setup() {
  return render(<SearchResults query="cip" results={generics} brands={brands} loading={false} lang="en" onSelectGeneric={vi.fn()} onSelectBrand={vi.fn()} />)
}

describe('SearchResults filter chips', () => {
  it('shows both generics and brands under "All" by default', () => {
    setup()
    expect(screen.getByTestId('drug-card-J01MA02')).toBeTruthy()
    expect(screen.getByTestId('brand-result-b1')).toBeTruthy()
  })

  it('shows only generics when the Generics chip is selected', () => {
    setup()
    fireEvent.press(screen.getByTestId('search-filter-gen'))
    expect(screen.getByTestId('drug-card-J01MA02')).toBeTruthy()
    expect(screen.queryByTestId('brand-result-b1')).toBeNull()
  })

  it('shows only brands when the Brands chip is selected', () => {
    setup()
    fireEvent.press(screen.getByTestId('search-filter-brand'))
    expect(screen.queryByTestId('drug-card-J01MA02')).toBeNull()
    expect(screen.getByTestId('brand-result-b1')).toBeTruthy()
    expect(screen.getByTestId('brand-result-b2')).toBeTruthy()
  })

  it('shows an empty state when nothing matches', () => {
    render(<SearchResults query="zzz" results={[]} brands={[]} loading={false} lang="en" onSelectGeneric={vi.fn()} onSelectBrand={vi.fn()} />)
    expect(screen.getByTestId('empty')).toBeTruthy()
  })
})

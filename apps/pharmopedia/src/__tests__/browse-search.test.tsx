/**
 * browse-search.test.tsx
 *
 * The Browse tab gains a name/brand search box above the therapeutic-class
 * list. Empty query → class browser (unchanged). Non-empty query → live
 * drug results (which match generic name, brand name, ATC and local names via
 * the shared useDrugSearch hook).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react-native'
import BrowseTab from '@/app/(tabs)/browse'

const searchState = vi.hoisted(() => ({
  query: '',
  results: [] as Array<{ atcCode: string; innName: string; brandNames: string[]; doseForms: string[]; therapeuticClass: string; localName?: string }>,
  loading: false,
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({ surface: '#fff', border: '#e5e7eb', textPrimary: '#111', textMuted: '#9ca3af', surfaceSubtle: '#f3f4f6', primary500: '#2e9e71' }),
}))
vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: async () => [{ name: 'Antibacterials', count: 3 }],
  getDrugsByTherapeuticClass: async () => [],
}))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/hooks/useDrugSearch', () => ({ useDrugSearch: () => ({ ...searchState, search: vi.fn() }) }))
vi.mock('@/components/DrugCard', () => {
  const React = require('react')
  const { Text } = require('react-native')
  return {
    DrugCard: ({ result }: { result: { atcCode: string; innName: string } }) =>
      React.createElement(Text, { testID: `drug-card-${result.atcCode}` }, result.innName),
  }
})

describe('BrowseTab — name/brand search', () => {
  beforeEach(() => {
    searchState.query = ''
    searchState.results = []
    searchState.loading = false
  })

  it('renders the search input above the class list', async () => {
    const { findByTestId } = render(<BrowseTab />)
    expect(await findByTestId('search-input')).toBeTruthy()
  })

  it('shows therapeutic classes when the query is empty', async () => {
    const { findByTestId } = render(<BrowseTab />)
    expect(await findByTestId('class-card-Antibacterials')).toBeTruthy()
  })

  it('shows drug results (not classes) when a query is active', async () => {
    searchState.query = 'augment'
    searchState.results = [
      { atcCode: 'J01CR02', innName: 'Amoxicillin / clavulanate', brandNames: ['Augmentin'], doseForms: ['tablet'], therapeuticClass: 'Antibacterials' },
    ]
    const { findByTestId, queryByTestId } = render(<BrowseTab />)
    expect(await findByTestId('drug-card-J01CR02')).toBeTruthy()
    expect(queryByTestId('class-card-Antibacterials')).toBeNull()
  })
})

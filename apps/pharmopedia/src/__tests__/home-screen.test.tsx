import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

const push = vi.fn()
const addRecent = vi.fn()
const h = vi.hoisted(() => ({ role: 'PATIENT' }))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { user: { role: string } | null }) => unknown) => s({ user: { role: h.role } }) }))
vi.mock('@/store/bookmark-store', () => ({ useBookmarkStore: (s: (x: { bookmarks: [] }) => unknown) => s({ bookmarks: [] }) }))
vi.mock('@/store/recent-search-store', () => ({
  useRecentSearchStore: (s: (x: { recents: string[]; add: ReturnType<typeof vi.fn> }) => unknown) =>
    s({ recents: ['amox', 'metformin'], add: addRecent }),
}))
vi.mock('@/store/lang-store', () => ({
  useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }),
  isRtlLang: () => false,
}))
vi.mock('@/db/recalls', () => ({ getActiveRecalls: vi.fn(async () => []) }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

// Mock useDrugSearch — overridden per test via mockUseDrugSearch.mockReturnValue(...)
const mockUseDrugSearch = vi.fn()
vi.mock('@/hooks/useDrugSearch', () => ({ useDrugSearch: (...args: unknown[]) => mockUseDrugSearch(...args) }))

// Mock SearchBar as a no-op (hook is mocked; SearchBar isn't exercised in these tests)
vi.mock('@/components/SearchBar', () => ({
  SearchBar: () => null,
}))

// Mock DrugCard to render result.innName as pressable text (so tests can press it)
vi.mock('@/components/DrugCard', () => {
  const { Pressable, Text } = require('react-native')
  return {
    DrugCard: ({ result, onPress }: { result: { innName: string }; onPress: () => void }) => (
      <Pressable onPress={onPress}>
        <Text>{result.innName}</Text>
      </Pressable>
    ),
  }
})

import HomeTab from '@/app/(tabs)/index'
import { getActiveRecalls } from '@/db/recalls'

const ROW = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: [] as string[],
  doseForms: [] as string[],
  therapeuticClass: 'Antibacterials',
  localName: undefined,
}

describe('HomeTab', () => {
  beforeEach(() => {
    h.role = 'PATIENT'
    push.mockClear()
    addRecent.mockClear()
    vi.mocked(getActiveRecalls).mockReset()
    vi.mocked(getActiveRecalls).mockResolvedValue([])
    // Default: empty query (dashboard mode)
    mockUseDrugSearch.mockReturnValue({ query: '', results: [], loading: false, search: vi.fn() })
  })

  // ── Inline search behavior ───────────────────────────────────────────────

  it('renders search results inline as the query changes', () => {
    mockUseDrugSearch.mockReturnValue({ query: 'amox', results: [ROW], loading: false, search: vi.fn() })
    const { getByText } = render(<HomeTab />)
    expect(getByText('Amoxicillin')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('opens a result and records the recent query', () => {
    const search = vi.fn()
    mockUseDrugSearch.mockReturnValue({ query: 'amox', results: [ROW], loading: false, search })
    const { getByText } = render(<HomeTab />)
    fireEvent.press(getByText('Amoxicillin'))
    expect(addRecent).toHaveBeenCalledWith('amox')
    expect(push).toHaveBeenCalledWith('/drug/J01CA04')
  })

  it('shows dashboard sections when the query is empty', () => {
    mockUseDrugSearch.mockReturnValue({ query: '', results: [], loading: false, search: vi.fn() })
    const { getByText, queryByText } = render(<HomeTab />)
    expect(getByText('metformin')).toBeTruthy()
    expect(queryByText('Amoxicillin')).toBeNull()
  })

  it('sets the query from a recent chip (does not navigate to /search)', () => {
    const search = vi.fn()
    mockUseDrugSearch.mockReturnValue({ query: '', results: [], loading: false, search })
    const { getByText } = render(<HomeTab />)
    fireEvent.press(getByText('metformin'))
    expect(search).toHaveBeenCalledWith('metformin')
    expect(push).not.toHaveBeenCalledWith({ pathname: '/search', params: { q: 'metformin' } })
  })

  // ── Existing dashboard behavior ──────────────────────────────────────────

  it('hides the safety-alerts section for a patient role', () => {
    const { queryByText } = render(<HomeTab />)
    expect(queryByText('home.safetyAlerts')).toBeNull()
  })

  it('shows the safety-alerts section for a pharmacist with active recalls', async () => {
    h.role = 'PHARMACIST'
    vi.mocked(getActiveRecalls).mockResolvedValue([
      { atcCode: 'A02BC01', innName: 'Omeprazole', description: 'Impurity found' },
    ])
    const { findByText } = render(<HomeTab />)
    expect(await findByText('home.safetyAlerts')).toBeTruthy()
  })

  it('shows the saved-empty CTA when there are no bookmarks', () => {
    const { getByText } = render(<HomeTab />)
    expect(getByText('home.browseCta')).toBeTruthy()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react-native'

const sp = vi.hoisted(() => ({ q: undefined as string | undefined }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }), useLocalSearchParams: () => ({ q: sp.q }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: null }) => unknown) => s({ token: null }) }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/recent-search-store', () => ({ useRecentSearchStore: Object.assign((sel: (s: { add: () => Promise<void> }) => unknown) => sel({ add: vi.fn() }), { getState: () => ({ add: vi.fn() }) }) }))
vi.mock('@/db/fts', () => ({ searchDrugs: vi.fn(async () => []) }))
vi.mock('@/api/drug-catalog', () => ({ searchDrugsApi: vi.fn(async () => []) }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/components/SearchBar', () => ({ SearchBar: () => null }))
vi.mock('@/components/SyncStatusBanner', () => ({ SyncStatusBanner: () => null }))
vi.mock('@/components/NetStatusBanner', () => ({ NetStatusBanner: () => null }))
vi.mock('@/components/DrugCard', () => ({ DrugCard: () => null }))
vi.mock('@/components/SkeletonCard', () => ({ SkeletonCard: () => null }))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#ffffff', surfaceSubtle: '#f3f4f6', textPrimary: '#111827',
    textSecondary: '#6b7280', textMuted: '#9ca3af', primary500: '#2e9e71',
  }),
}))

import SearchTab from '@/app/search'
import { searchDrugs } from '@/db/fts'

describe('SearchTab', () => {
  beforeEach(() => {
    sp.q = undefined
    vi.mocked(searchDrugs).mockClear()
  })

  it('renders the screen title and the empty prompt', () => {
    const { getByText } = render(<SearchTab />)
    expect(getByText('tabs.search')).toBeTruthy()
    expect(getByText('search.emptyTitle')).toBeTruthy()
  })

  it('seeds an initial search from the ?q= param', async () => {
    sp.q = 'amox'
    render(<SearchTab />)
    await waitFor(() => expect(vi.mocked(searchDrugs)).toHaveBeenCalled())
    expect(vi.mocked(searchDrugs).mock.calls[0][1]).toBe('amox')
  })
})

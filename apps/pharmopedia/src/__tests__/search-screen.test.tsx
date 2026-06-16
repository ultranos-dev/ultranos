import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import SearchTab from '@/app/(tabs)/index'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: null }) => unknown) => s({ token: null }) }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 0 }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/db/fts', () => ({ searchDrugs: async () => [] }))
vi.mock('@/api/drug-catalog', () => ({ searchDrugsApi: async () => [] }))
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

describe('SearchTab', () => {
  it('renders the screen title and the empty prompt', () => {
    const { getByText } = render(<SearchTab />)
    expect(getByText('tabs.search')).toBeTruthy()
    expect(getByText('search.emptyTitle')).toBeTruthy()
  })
})

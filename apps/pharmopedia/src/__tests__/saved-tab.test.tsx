import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import SavedTab from '@/app/(tabs)/saved'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/bookmark-store', () => ({ useBookmarkStore: (s: (x: { bookmarks: []; brandBookmarks: [] }) => unknown) => s({ bookmarks: [], brandBookmarks: [] }) }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))

describe('SavedTab', () => {
  it('renders the title and an empty state with a browse CTA', () => {
    const { getByText } = render(<SavedTab />)
    expect(getByText('tabs.saved')).toBeTruthy()
    expect(getByText('saved.emptyTitle')).toBeTruthy()
    expect(getByText('saved.browseCta')).toBeTruthy()
  })
})

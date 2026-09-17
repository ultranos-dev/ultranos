import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import SavedTab from '@/app/(tabs)/saved'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))

// Mutable store state — tests mutate this before rendering.
const bookmarkState = vi.hoisted(() => ({
  bookmarks: [] as { atcCode: string; innName: string; therapeuticClass: string | null; savedAt: string }[],
  brandBookmarks: [] as { id: string; brandName: string; genericAtcCode: string; genericInnName: string | null; manufacturer: string | null; doseForm: string | null; referencePrice: number | null; currency: string | null; savedAt: string }[],
  initialized: true,
}))

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (s: (x: typeof bookmarkState) => unknown) => s(bookmarkState),
}))

// SkeletonCard stub (avoids Reanimated + theme deps in unit tests).
vi.mock('@/components/SkeletonCard', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    SkeletonCard: ({ testID }: { testID?: string }) =>
      React.createElement(View, { testID }),
  }
})

describe('SavedTab — 4-state', () => {
  it('renders the title and empty state with browse CTA when initialized with no bookmarks', () => {
    bookmarkState.initialized = true
    bookmarkState.bookmarks = []
    bookmarkState.brandBookmarks = []
    const { getByText } = render(<SavedTab />)
    expect(getByText('tabs.saved')).toBeTruthy()
    expect(getByText('saved.emptyTitle')).toBeTruthy()
    expect(getByText('saved.browseCta')).toBeTruthy()
  })

  it('shows skeleton cards while the bookmark store is not yet initialized (false-empty guard)', () => {
    bookmarkState.initialized = false
    bookmarkState.bookmarks = []
    bookmarkState.brandBookmarks = []
    const { getByTestId } = render(<SavedTab />)
    expect(getByTestId('saved-loading')).toBeTruthy()
  })

  it('does NOT show the empty-state title while bookmarks are still loading', () => {
    bookmarkState.initialized = false
    bookmarkState.bookmarks = []
    bookmarkState.brandBookmarks = []
    const { queryByText } = render(<SavedTab />)
    expect(queryByText('saved.emptyTitle')).toBeNull()
  })
})

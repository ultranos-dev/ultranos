import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

const push = vi.fn()
const h = vi.hoisted(() => ({ role: 'PATIENT' }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { user: { role: string } | null }) => unknown) => s({ user: { role: h.role } }) }))
vi.mock('@/store/bookmark-store', () => ({ useBookmarkStore: (s: (x: { bookmarks: [] }) => unknown) => s({ bookmarks: [] }) }))
vi.mock('@/store/recent-search-store', () => ({ useRecentSearchStore: (s: (x: { recents: string[] }) => unknown) => s({ recents: ['amox', 'metformin'] }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/db/recalls', () => ({ getActiveRecalls: vi.fn(async () => []) }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

import HomeTab from '@/app/(tabs)/index'
import { getActiveRecalls } from '@/db/recalls'

describe('HomeTab', () => {
  beforeEach(() => {
    h.role = 'PATIENT'
    push.mockClear()
    vi.mocked(getActiveRecalls).mockReset()
    vi.mocked(getActiveRecalls).mockResolvedValue([])
  })

  it('renders a greeting and the search field', () => {
    const { getByTestId } = render(<HomeTab />)
    expect(getByTestId('home-search-field')).toBeTruthy()
  })

  it('pushes /search when the search field is tapped', () => {
    const { getByTestId } = render(<HomeTab />)
    fireEvent.press(getByTestId('home-search-field'))
    expect(push).toHaveBeenCalledWith('/search')
  })

  it('renders recent chips and navigates with the query on tap', () => {
    const { getByText } = render(<HomeTab />)
    expect(getByText('amox')).toBeTruthy()
    fireEvent.press(getByText('metformin'))
    expect(push).toHaveBeenCalledWith({ pathname: '/search', params: { q: 'metformin' } })
  })

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

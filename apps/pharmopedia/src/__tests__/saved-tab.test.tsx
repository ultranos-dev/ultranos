import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'

const mockPush = vi.fn()

vi.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'saved.empty': 'No saved drugs yet',
      }
      return map[key] ?? key
    },
  }),
}))
let mockLang = 'en'
vi.mock('@/store/lang-store', () => ({
  useLangStore: (s: (state: { lang: string }) => unknown) => s({ lang: mockLang }),
  isRtlLang: (lang: string) => lang === 'ar' || lang === 'prs' || lang === 'ps',
}))

type Bookmark = { atcCode: string; innName: string; therapeuticClass: string | null; savedAt: string }
let mockBookmarks: Bookmark[] = []

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (s: (state: { bookmarks: Bookmark[] }) => unknown) =>
    s({ bookmarks: mockBookmarks }),
}))

import SavedTab from '@/app/(tabs)/saved'

const BOOKMARKS: Bookmark[] = [
  { atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials', savedAt: '2026-06-13T00:00:00.000Z' },
  { atcCode: 'N02BE01', innName: 'Paracetamol', therapeuticClass: 'Analgesics', savedAt: '2026-06-12T00:00:00.000Z' },
]

describe('SavedTab', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockBookmarks = []
    mockLang = 'en'
  })

  it('shows empty state when no bookmarks', () => {
    render(<SavedTab />)
    expect(screen.getByText('No saved drugs yet')).toBeTruthy()
  })

  it('renders a DrugCard for each bookmark', () => {
    mockBookmarks = BOOKMARKS
    render(<SavedTab />)
    expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy()
    expect(screen.getByTestId('drug-card-N02BE01')).toBeTruthy()
  })

  it('pressing a DrugCard navigates to drug detail', () => {
    mockBookmarks = BOOKMARKS
    render(<SavedTab />)
    fireEvent.press(screen.getByTestId('drug-card-J01CA04'))
    expect(mockPush).toHaveBeenCalledWith('/drug/J01CA04')
  })

  it('renders drug cards in RTL (lang: ar)', () => {
    mockLang = 'ar'
    mockBookmarks = BOOKMARKS
    render(<SavedTab />)
    expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy()
    expect(screen.getByTestId('drug-card-N02BE01')).toBeTruthy()
  })
})

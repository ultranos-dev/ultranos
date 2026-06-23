import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockToggle, state } = vi.hoisted(() => ({
  mockToggle: vi.fn(),
  state: { bookmarked: false },
}))

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ isRtlLang: () => false }))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({ db: true }) }))
vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))
vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (
    s: (st: { isBookmarked: (a: string) => boolean; toggle: typeof mockToggle }) => unknown,
  ) => s({ isBookmarked: () => state.bookmarked, toggle: mockToggle }),
}))
vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#fff', textPrimary: '#111', textSecondary: '#666', textMuted: '#999', primary500: '#2e9e71',
  }),
}))
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) => React.createElement(View, { testID }, children),
    useReducedMotion: () => false,
  }
})

import { render, screen, fireEvent } from '@testing-library/react-native'
import { DrugCard } from '@/components/DrugCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

const DRUG: DrugSearchResult = {
  atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [],
  therapeuticClass: 'Antibacterials', localName: undefined,
}

beforeEach(() => { vi.clearAllMocks(); state.bookmarked = false })

describe('DrugCard — bookmark toggle', () => {
  it('shows an unselected (outline) heart when the drug is not bookmarked', () => {
    state.bookmarked = false
    render(<DrugCard result={DRUG} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('bookmark-toggle').props.accessibilityState).toEqual({ selected: false })
  })

  it('shows a selected (filled) heart when the drug is bookmarked', () => {
    state.bookmarked = true
    render(<DrugCard result={DRUG} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('bookmark-toggle').props.accessibilityState).toEqual({ selected: true })
  })

  it('toggles the bookmark (with the entry) when the heart is pressed', () => {
    render(<DrugCard result={DRUG} lang="en" onPress={vi.fn()} />)
    fireEvent.press(screen.getByTestId('bookmark-toggle'))
    expect(mockToggle).toHaveBeenCalledTimes(1)
    expect(mockToggle).toHaveBeenCalledWith(
      { db: true },
      { atcCode: 'J01CA04', innName: 'Amoxicillin', therapeuticClass: 'Antibacterials' },
    )
  })
})

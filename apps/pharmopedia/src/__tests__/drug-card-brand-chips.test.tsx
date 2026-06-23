/**
 * drug-card-brand-chips.test.tsx
 *
 * Brand-name chips on the DrugCard (Option B2). Generic name stays the title;
 * brand names render as chips beneath it. When a search `query` is supplied,
 * the brand(s) that match are promoted to the front and marked as matched so
 * users see *why* a result came back for a brand they typed.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { DrugCard } from '@/components/DrugCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

vi.mock('@/store/lang-store', () => ({
  isRtlLang: (lang: string) => ['prs', 'ps', 'ar'].includes(lang),
}))

vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (s: (state: { isBookmarked: (atcCode: string) => boolean; toggle: () => void }) => unknown) =>
    s({ isBookmarked: () => false, toggle: vi.fn() }),
}))

vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    surface: '#ffffff',
    surfaceSubtle: '#f3f4f6',
    borderSubtle: '#e5e7eb',
    border: '#d8dde6',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    primary50: '#edfaf4',
    primary100: '#d0f3e5',
    primary500: '#2e9e71',
    primary700: '#1c6248',
    white: '#ffffff',
    danger: '#dc2626',
  }),
}))

vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(View, { testID, 'data-testid': testID, accessibilityRole: 'none' }, children),
    useReducedMotion: () => false,
  }
})

function drug(overrides: Partial<DrugSearchResult> = {}): DrugSearchResult {
  return {
    atcCode: 'J01CR02',
    innName: 'Amoxicillin / clavulanate',
    brandNames: ['Augmentin', 'Clavamox', 'Co-amoxiclav'],
    therapeuticClass: 'Antibacterials',
    doseForms: ['tablet', 'syrup'],
    localName: undefined,
    ...overrides,
  }
}

describe('DrugCard — brand chips', () => {
  it('renders a brand chip for each brand name when present', () => {
    render(<DrugCard result={drug()} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-brand-chips')).toBeTruthy()
    expect(screen.getByText('Augmentin')).toBeTruthy()
    expect(screen.getByText('Clavamox')).toBeTruthy()
  })

  it('omits the brand-chip row entirely when there are no brand names', () => {
    render(<DrugCard result={drug({ brandNames: [] })} lang="en" onPress={vi.fn()} />)
    expect(screen.queryByTestId('drug-brand-chips')).toBeNull()
  })

  it('marks the brand that matches the query and promotes it to the front', () => {
    render(
      <DrugCard
        result={drug({ brandNames: ['Clavamox', 'Co-amoxiclav', 'Augmentin'] })}
        lang="en"
        query="augment"
        onPress={vi.fn()}
      />,
    )
    const matched = screen.getAllByTestId('drug-brand-chip-matched')
    expect(matched).toHaveLength(1)
    expect(matched[0].props.children).toBe('Augmentin')
  })

  it('caps visible chips at 3 and shows a "+N" overflow chip', () => {
    render(
      <DrugCard
        result={drug({ brandNames: ['B1', 'B2', 'B3', 'B4', 'B5'] })}
        lang="en"
        onPress={vi.fn()}
      />,
    )
    expect(screen.getAllByTestId('drug-brand-chip')).toHaveLength(3)
    expect(screen.getByTestId('drug-brand-chip-more').props.children).toBe('+2')
  })

  it('still shows a matched brand even when it sits past the visible cap', () => {
    render(
      <DrugCard
        result={drug({ brandNames: ['Apex', 'Beta', 'Cresta', 'Delta', 'Zentar'] })}
        lang="en"
        query="zent"
        onPress={vi.fn()}
      />,
    )
    // Zentar is last in the source list but matches — it must be promoted and visible.
    expect(screen.getByText('Zentar')).toBeTruthy()
    expect(screen.getByTestId('drug-brand-chip-matched').props.children).toBe('Zentar')
  })
})

/**
 * drug-card-restyle.test.tsx
 *
 * Snapshot baseline for the DrugCard Clinical-Calm Card restyle (Task 3, E6).
 * LTR (lang='en') and RTL (lang='ar' with localName) snapshots.
 * Asserts testID presence and bookmark-absent path.
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
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    primary500: '#2e9e71',
    danger: '#dc2626',
  }),
}))

// Mock the ui-kit native Card so it renders as a plain View in the node
// test environment. Card internally calls useThemeColors from ui-kit's own
// theme context; mocking avoids the context dependency in unit tests.
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    Card: ({ children, testID }: { children: React.ReactNode; testID?: string }) =>
      React.createElement(View, { testID, 'data-testid': testID, accessibilityRole: 'none' }, children),
  }
})

const LTR_DRUG: DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'Amoxicillin',
  brandNames: ['Amoxil'],
  therapeuticClass: 'Antibacterials',
  doseForms: ['Capsule 500mg', 'Suspension 250mg/5ml'],
  localName: undefined,
}

const RTL_DRUG: DrugSearchResult = {
  atcCode: 'C10AA01',
  innName: 'Simvastatin',
  brandNames: ['Zocor'],
  therapeuticClass: 'Lipid-modifying agents',
  doseForms: ['Tablet 20mg'],
  localName: 'سيمفاستاتين',
}

describe('DrugCard — restyle snapshots', () => {
  it('LTR snapshot (lang=en, no bookmark)', () => {
    const { toJSON } = render(<DrugCard result={LTR_DRUG} lang="en" onPress={vi.fn()} />)
    expect(toJSON()).toMatchSnapshot()
  })

  it('RTL snapshot (lang=ar, with localName)', () => {
    const { toJSON } = render(<DrugCard result={RTL_DRUG} lang="ar" onPress={vi.fn()} />)
    expect(toJSON()).toMatchSnapshot()
  })

  it('renders testID drug-card-<atc>', () => {
    render(<DrugCard result={LTR_DRUG} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-card-J01CA04')).toBeTruthy()
  })

  it('renders drug-primary-name testID', () => {
    render(<DrugCard result={LTR_DRUG} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name')).toBeTruthy()
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('Amoxicillin')
  })

  it('renders the bookmark toggle (heart) and no secondary name for en+no-localName', () => {
    render(<DrugCard result={LTR_DRUG} lang="en" onPress={vi.fn()} />)
    expect(screen.getByTestId('bookmark-toggle')).toBeTruthy()
    // drug-secondary-name absent for en+no-localName
    expect(screen.queryByTestId('drug-secondary-name')).toBeNull()
  })

  it('RTL: promotes localName to primary, INN to secondary', () => {
    render(<DrugCard result={RTL_DRUG} lang="ar" onPress={vi.fn()} />)
    expect(screen.getByTestId('drug-primary-name').props.children).toBe('سيمفاستاتين')
    expect(screen.getByTestId('drug-secondary-name').props.children).toBe('Simvastatin')
  })
})

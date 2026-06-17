import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    surface: '#fff', surfaceSubtle: '#f5f5f5', border: '#e5e5e5',
    primary500: '#2e9e71', primary50: '#ecfdf5', primary600: '#1d8a5e',
    infoLight: '#dbeafe', info: '#3b82f6',
    dangerLight: '#fee2e2', danger: '#dc2626',
    warningLight: '#fef3c7', warning: '#d97706',
    white: '#fff', borderSubtle: '#f0f0f0',
  }),
}))

vi.mock('@/store/lang-store', () => ({
  useLangStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ lang: 'en' }),
  isRtlLang: () => false,
}))

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (sel?: (s: Record<string, unknown>) => unknown) => {
    const state = { status: 'syncing', syncedCount: 10, lastSyncAt: null }
    if (typeof sel === 'function') return sel(state)
    return state
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

vi.mock('@/lib/haptics', () => ({ hapticSelection: vi.fn() }))
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  function AnimatedView(props: Record<string, unknown>) {
    return React.createElement('View', props, props.children)
  }
  function AnimatedText(props: Record<string, unknown>) {
    return React.createElement('Text', props, props.children)
  }
  return {
    default: { View: AnimatedView, Text: AnimatedText, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: () => ({ value: 1 }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: number) => v,
    withRepeat: (v: number) => v,
    Easing: { inOut: () => undefined, ease: undefined },
    FadeIn: { delay: () => ({ duration: () => ({}) }) },
    FadeInDown: { duration: () => ({}) },
    FadeInUp: { delay: () => ({ duration: () => ({}) }) },
    FadeOutUp: { duration: () => ({}) },
  }
})

// Mocks needed for BrowseTab rendering
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: async () => [{ name: 'Antibacterials', count: 3 }],
  getDrugsByTherapeuticClass: async () => [],
}))
vi.mock('@/store/coach-mark-store', () => ({
  useCoachMarkStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ dismissed: new Set(), dismiss: vi.fn() }),
}))

// Mocks needed for DrugCard
vi.mock('@/store/bookmark-store', () => ({
  useBookmarkStore: (sel: (s: { isBookmarked: (atcCode: string) => boolean }) => unknown) =>
    sel({ isBookmarked: () => false }),
}))
vi.mock('@ultranos/ui-kit/native', () => {
  const React = require('react')
  const { View, Pressable, Text } = require('react-native')
  const useReducedMotion = () => true
  const CollapsibleList = ({ ListEmptyComponent, renderItem, data, keyExtractor }: {
    ListEmptyComponent?: React.ReactNode
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode
    data: unknown[]
    keyExtractor: (item: unknown) => string
  }) =>
    React.createElement(View, null,
      data.length === 0
        ? ListEmptyComponent
        : data.map((item, index) => React.createElement(View, { key: keyExtractor(item) }, renderItem({ item, index }))),
    )
  const EmptyState = ({ title }: { title: string }) => React.createElement(Text, null, title)
  const Card = ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children)
  const ListRow = ({ label, accessibilityLabel, onPress, testID }: {
    label: string; accessibilityLabel?: string; onPress?: () => void; testID?: string
  }) =>
    React.createElement(Pressable, {
      testID, onPress, accessibilityRole: 'button',
      accessibilityLabel: accessibilityLabel ?? label,
    }, React.createElement(Text, null, label))
  return { useReducedMotion, CollapsibleList, EmptyState, Card, ListRow }
})

describe('Accessibility roles', () => {
  it('SearchBar has accessibilityRole search', async () => {
    const { SearchBar } = await import('@/components/SearchBar')
    const { getByTestId } = render(<SearchBar value="" onSearch={vi.fn()} />)
    const input = getByTestId('search-input')
    expect(input.props.accessibilityRole).toBe('search')
  })

  it('SyncStatusBanner has accessibilityLiveRegion', async () => {
    const { SyncStatusBanner } = await import('@/components/SyncStatusBanner')
    const { getByText } = render(<SyncStatusBanner />)
    const text = getByText(/sync/)
    expect(text.props.accessibilityLiveRegion).toBe('polite')
  })

  it('RoleBadge has accessibilityLabel', async () => {
    const { RoleBadge } = await import('@/components/RoleBadge')
    const { getByLabelText } = render(<RoleBadge role="DOCTOR" />)
    expect(getByLabelText('DOCTOR')).toBeTruthy()
  })

  it('SkeletonCard is hidden from accessibility tree', async () => {
    const { SkeletonCard } = await import('@/components/SkeletonCard')
    const { getByTestId } = render(<SkeletonCard testID="skel" />)
    expect(getByTestId('skel').props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('Browse back button has accessibilityRole=button and non-empty accessibilityLabel', async () => {
    const { default: BrowseTab } = await import('@/app/(tabs)/browse')
    const { findByTestId } = render(<BrowseTab />)
    // Press a class card to transition to drill-down view which shows the back button
    const classCard = await findByTestId('class-card-Antibacterials')
    fireEvent.press(classCard)
    const backBtn = await waitFor(() => findByTestId('browse-back-btn'))
    expect(backBtn.props.accessibilityRole).toBe('button')
    expect(typeof backBtn.props.accessibilityLabel).toBe('string')
    expect(backBtn.props.accessibilityLabel.length).toBeGreaterThan(0)
  })

  it('DrugCard has accessibilityRole=button and non-empty accessibilityLabel', async () => {
    const { DrugCard } = await import('@/components/DrugCard')
    const result = {
      atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [],
      therapeuticClass: 'Antibacterials', doseForms: [], localName: undefined,
    }
    const { getByTestId } = render(<DrugCard result={result} lang="en" onPress={vi.fn()} />)
    const card = getByTestId('drug-card-J01CA04')
    expect(card.props.accessibilityRole).toBe('button')
    expect(typeof card.props.accessibilityLabel).toBe('string')
    expect(card.props.accessibilityLabel.length).toBeGreaterThan(0)
  })

  it('TherapeuticClassCard row has accessibilityLabel containing the count', async () => {
    const { TherapeuticClassCard } = await import('@/components/TherapeuticClassCard')
    const { getByTestId } = render(
      <TherapeuticClassCard name="Cardiovascular" count={12} onPress={vi.fn()} />,
    )
    const row = getByTestId('class-card-Cardiovascular')
    expect(row.props.accessibilityLabel).toContain('12')
  })
})

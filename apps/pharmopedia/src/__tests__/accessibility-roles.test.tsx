import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'

vi.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    textPrimary: '#111', textSecondary: '#666', textMuted: '#999',
    surface: '#fff', surfaceSubtle: '#f5f5f5', border: '#e5e5e5',
    primary500: '#2e9e71', infoLight: '#dbeafe', info: '#3b82f6',
    dangerLight: '#fee2e2', danger: '#dc2626',
    warningLight: '#fef3c7', warning: '#d97706',
    white: '#fff',
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
})

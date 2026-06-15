import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react-native'
import { Colors, ColorsDark } from '@ultranos/ui-kit/tokens.native'
import { useThemeStore } from '@/store/theme-store'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return {
    ...actual,
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  }
})

import { useThemeColors } from '@/hooks/useThemeColors'

beforeEach(() => {
  useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true })
})

describe('useThemeColors', () => {
  it('returns Colors when resolvedTheme is light', () => {
    const { result } = renderHook(() => useThemeColors())
    expect(result.current.surface).toBe(Colors.surface)
    expect(result.current.textPrimary).toBe(Colors.textPrimary)
  })

  it('returns ColorsDark when resolvedTheme is dark', () => {
    useThemeStore.setState({ resolvedTheme: 'dark' })
    const { result } = renderHook(() => useThemeColors())
    expect(result.current.surface).toBe(ColorsDark.surface)
    expect(result.current.textPrimary).toBe(ColorsDark.textPrimary)
  })
})

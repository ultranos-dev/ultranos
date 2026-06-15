import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-native'

// Mock SecureStore
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

// Mock Appearance
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

import * as SecureStore from 'expo-secure-store'
import { Appearance } from 'react-native'
import { useThemeStore, type ThemeMode } from '@/store/theme-store'

beforeEach(() => {
  vi.clearAllMocks()
  useThemeStore.setState({
    mode: 'light',
    resolvedTheme: 'light',
    initialized: false,
  })
})

describe('theme-store', () => {
  it('initializes with light defaults', () => {
    const { result } = renderHook(() => useThemeStore())
    expect(result.current.mode).toBe('light')
    expect(result.current.resolvedTheme).toBe('light')
    expect(result.current.initialized).toBe(false)
  })

  it('init loads persisted mode from SecureStore', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })

    expect(result.current.mode).toBe('dark')
    expect(result.current.resolvedTheme).toBe('dark')
    expect(result.current.initialized).toBe(true)
  })

  it('init resolves system mode using Appearance', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('system')
    vi.mocked(Appearance.getColorScheme).mockReturnValue('dark')

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })

    expect(result.current.mode).toBe('system')
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('init defaults to light when SecureStore is empty', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null)

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })

    expect(result.current.mode).toBe('light')
    expect(result.current.resolvedTheme).toBe('light')
  })

  it('setMode persists to SecureStore and updates state', async () => {
    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.setMode('dark') })

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('pharmopedia.theme', 'dark')
    expect(result.current.mode).toBe('dark')
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('setMode to system resolves via Appearance', async () => {
    vi.mocked(Appearance.getColorScheme).mockReturnValue('dark')

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.setMode('system') })

    expect(result.current.mode).toBe('system')
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('onSystemChange updates resolvedTheme when mode is system', () => {
    useThemeStore.setState({ mode: 'system', resolvedTheme: 'light', initialized: true })

    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.onSystemChange('dark') })

    // Read final state directly: the custom renderHook mock does not re-render
    // the TestComponent on synchronous Zustand updates, so getState() is the
    // authoritative source for synchronous action assertions.
    expect(useThemeStore.getState().resolvedTheme).toBe('dark')
  })

  it('onSystemChange is ignored when mode is not system', () => {
    useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true })

    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.onSystemChange('dark') })

    expect(useThemeStore.getState().resolvedTheme).toBe('light')
  })
})

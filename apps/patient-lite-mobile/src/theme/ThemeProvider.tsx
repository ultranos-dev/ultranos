/**
 * Story 18.11: Theme Context & Provider
 *
 * Provides theme state (light/dark/system) to the entire app.
 * - Persists mode to AsyncStorage under '@ultranos/theme-mode'
 * - On first launch: respects system-level dark mode (Appearance API)
 * - Theme change is immediate — no app restart required
 * - Listens for OS theme changes when mode is 'system'
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { Appearance, type ColorSchemeName } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  lightColors,
  darkColors,
  healthCardColors,
  notificationTypeColors,
  type ThemeColors,
} from './colors'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = '@ultranos/theme-mode'

export interface ThemeContextValue {
  /** User-selected mode: light, dark, or system */
  mode: ThemeMode
  /** Resolved theme after applying system preference */
  theme: ResolvedTheme
  /** Active color tokens */
  colors: ThemeColors
  /** Health card colors for current theme */
  healthCards: typeof healthCardColors.light
  /** Notification type colors for current theme */
  notificationColors: typeof notificationTypeColors.light
  /** Change the theme mode */
  setMode: (mode: ThemeMode) => void
}

/** Default context value (light theme) for use outside provider (e.g., tests) */
const defaultContextValue: ThemeContextValue = {
  mode: 'light',
  theme: 'light',
  colors: lightColors,
  healthCards: healthCardColors.light,
  notificationColors: notificationTypeColors.light,
  setMode: () => {},
}

const ThemeContext = createContext<ThemeContextValue>(defaultContextValue)

function resolveTheme(mode: ThemeMode, systemScheme: ColorSchemeName): ResolvedTheme {
  if (mode === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light'
  }
  return mode
}

interface ThemeProviderProps {
  children: ReactNode
  /** Override initial mode for testing */
  initialMode?: ThemeMode
}

export function ThemeProvider({ children, initialMode }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? 'system')
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  )
  // Load persisted mode on mount (non-blocking — renders immediately with default)
  useEffect(() => {
    if (initialMode) return // Skip loading when initialMode provided (tests)

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored)
        }
        // If no stored value, default is 'system' — respects OS setting (AC #5)
      })
      .catch(() => {
        // Storage read failure — default to system
      })
  }, [initialMode])

  // Listen for OS theme changes (AC #5, Task 5)
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme)
    })
    return () => subscription.remove()
  }, [])

  // Persist latest mode — re-write after each setItem to guarantee last-value-wins
  const latestMode = useRef<ThemeMode>(initialMode ?? 'system')
  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    latestMode.current = newMode
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode)
      .then(() => {
        // Re-write if mode changed during the async write
        if (latestMode.current !== newMode) {
          return AsyncStorage.setItem(THEME_STORAGE_KEY, latestMode.current)
        }
      })
      .catch(() => {
        // Non-critical — theme will fall back to system on next launch
      })
  }, [])

  const theme = resolveTheme(mode, systemScheme)
  const colors = theme === 'dark' ? darkColors : lightColors
  const healthCards = theme === 'dark' ? healthCardColors.dark : healthCardColors.light
  const notificationColors = theme === 'dark'
    ? notificationTypeColors.dark
    : notificationTypeColors.light

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme,
      colors,
      healthCards,
      notificationColors,
      setMode,
    }),
    [mode, theme, colors, healthCards, notificationColors, setMode],
  )

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

/**
 * Hook to access theme state and colors.
 * Falls back to light theme when used outside ThemeProvider (e.g., in tests).
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

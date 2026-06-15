import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { Appearance } from 'react-native'

export type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const THEME_KEY = '@pharmopedia/theme'
const VALID_MODES: ReadonlySet<string> = new Set(['light', 'dark', 'system'])

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return (Appearance.getColorScheme() as ResolvedTheme) ?? 'light'
  }
  return mode
}

interface ThemeState {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  initialized: boolean
  init: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
  onSystemChange: (colorScheme: string | null) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  resolvedTheme: 'light',
  initialized: false,

  async init() {
    if (get().initialized) return
    let mode: ThemeMode = 'light'
    try {
      const saved = await SecureStore.getItemAsync(THEME_KEY)
      if (saved && VALID_MODES.has(saved)) {
        mode = saved as ThemeMode
      }
    } catch {
      // SecureStore unavailable — default to light
    }
    set({ mode, resolvedTheme: resolveTheme(mode), initialized: true })
  },

  async setMode(mode: ThemeMode) {
    await SecureStore.setItemAsync(THEME_KEY, mode)
    set({ mode, resolvedTheme: resolveTheme(mode) })
  },

  onSystemChange(colorScheme: string | null) {
    if (get().mode !== 'system') return
    set({ resolvedTheme: (colorScheme as ResolvedTheme) ?? 'light' })
  },
}))

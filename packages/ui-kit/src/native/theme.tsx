import { createContext, useContext, type ReactNode } from 'react'
import { Colors, ColorsDark, type ThemeColors } from '../tokens.native'

export type ThemeMode = 'light' | 'dark'

interface UiKitContextValue {
  mode: ThemeMode
  rtl: boolean
}

const UiKitContext = createContext<UiKitContextValue>({ mode: 'light', rtl: false })

export function UiKitProvider({
  mode = 'light',
  rtl = false,
  children,
}: {
  mode?: ThemeMode
  rtl?: boolean
  children: ReactNode
}) {
  return <UiKitContext.Provider value={{ mode, rtl }}>{children}</UiKitContext.Provider>
}

export function useThemeColors(): ThemeColors {
  return useContext(UiKitContext).mode === 'dark' ? ColorsDark : Colors
}

export function useRtl(): boolean {
  return useContext(UiKitContext).rtl
}

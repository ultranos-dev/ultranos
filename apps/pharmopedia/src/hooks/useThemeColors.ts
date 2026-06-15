import { Colors, ColorsDark } from '@ultranos/ui-kit/tokens.native'
import { useThemeStore } from '@/store/theme-store'

export function useThemeColors() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  return resolvedTheme === 'dark' ? ColorsDark : Colors
}

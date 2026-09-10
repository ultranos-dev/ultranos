import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native'
import { FontFamily } from '../tokens.native'

interface NumericTextProps extends TextProps {
  /** Value to render. Numbers are coerced to string by React Native's <Text>. */
  children: string | number
  /** Use the 700-weight Space Mono face. */
  bold?: boolean
}

/**
 * Renders numeric values in Google Space Mono across all RN/Expo apps.
 *
 * React Native has no per-glyph `unicode-range` fallback (the web digit-only
 * trick), so on mobile the whole value string is wrapped and rendered in
 * Space Mono — digits AND numeric punctuation ($, %, ., , : etc.). Only wrap
 * actual numeric values (counts, prices, doses, dates, IDs), not prose.
 *
 * Applies ONLY the font family so it composes cleanly:
 *  - Standalone: pass color/size via `style` (same as any <Text>).
 *  - Nested inside another <Text>: color/size/weight are inherited as usual —
 *    nothing is forced, so it never overrides the surrounding text's color.
 * Theme-agnostic (no context dependency) — works under any app's provider.
 *
 * Requires 'SpaceMono' / 'SpaceMono-Bold' to be registered in the app's
 * useFonts() (see @expo-google-fonts/space-mono).
 */
export function NumericText({ children, bold = false, style, ...rest }: NumericTextProps) {
  return (
    <Text {...rest} style={[bold ? styles.bold : styles.base, style]}>
      {children}
    </Text>
  )
}

const styles = StyleSheet.create<{ base: TextStyle; bold: TextStyle }>({
  base: { fontFamily: FontFamily.mono },
  bold: { fontFamily: FontFamily.monoBold },
})

import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native'
import { FontFamily } from '../tokens.native'
import { useThemeColors } from './theme'

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
 * Requires 'SpaceMono' / 'SpaceMono-Bold' to be registered in the app's
 * useFonts() (see @expo-google-fonts/space-mono).
 *
 * Color defaults to the theme's primary text color and can be overridden via
 * `style`. When nested inside another <Text>, color/size are inherited as usual.
 */
export function NumericText({ children, bold = false, style, ...rest }: NumericTextProps) {
  const colors = useThemeColors()
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        bold && styles.bold,
        { color: colors.textPrimary },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create<{ base: TextStyle; bold: TextStyle }>({
  base: { fontFamily: FontFamily.mono },
  bold: { fontFamily: FontFamily.monoBold },
})

import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, LineHeight, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

type Severity = 'danger' | 'warning' | 'info' | 'none'

interface SectionCardProps {
  title: string
  text?: string
  items?: string[]
  severity?: Severity
  isRtl?: boolean
  testID?: string
  children?: React.ReactNode
}

/**
 * Flat content block rendered INSIDE a CollapsibleSection body — no border, no
 * card chrome (the section card already provides that). An optional small
 * uppercase label, then text / bulleted items. Severity is conveyed by the
 * label color rather than a tinted box. RTL direction follows the content.
 */
export function SectionCard({ title, text, items, severity = 'none', isRtl, testID, children }: SectionCardProps) {
  const colors = useThemeColors()

  const titleColor =
    severity === 'danger' ? colors.danger : severity === 'warning' ? colors.warning : colors.textSecondary

  // Direction follows the CONTENT, not the ambient I18nManager.forceRTL: RTL content gets the
  // Arabic face + explicit rtl; LTR content gets explicit ltr so `·`/comma Latin segments never reorder.
  const rtlStyle = isRtl
    ? { fontFamily: FontFamily.arabic, writingDirection: 'rtl' as const, textAlign: 'right' as const }
    : { writingDirection: 'ltr' as const }

  return (
    <View testID={testID} style={styles.section}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: titleColor }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {text ? (
        <Text style={[styles.text, { color: colors.textPrimary }, rtlStyle]}>{text}</Text>
      ) : null}
      {items?.map((item, i) => (
        <Text key={i} style={[styles.item, { color: colors.textPrimary }, rtlStyle]}>
          {'•'} {item}
        </Text>
      ))}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: Spacing[1] },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: { fontSize: FontSize.base, fontFamily: FontFamily.sans, lineHeight: LineHeight.normal },
  item: { fontSize: FontSize.base, fontFamily: FontFamily.sans, lineHeight: LineHeight.normal },
})

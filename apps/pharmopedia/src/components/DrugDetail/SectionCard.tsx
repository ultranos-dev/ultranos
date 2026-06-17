import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
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

export function SectionCard({ title, text, items, severity = 'none', isRtl, testID, children }: SectionCardProps) {
  const colors = useThemeColors()

  const severityBg: Record<Severity, string | undefined> = {
    danger: colors.dangerLight,
    warning: colors.warningLight,
    info: colors.surfaceSubtle,
    none: undefined,
  }

  const severityBorder: Record<Severity, string | undefined> = {
    danger: colors.danger,
    warning: colors.warning,
    info: colors.border,
    none: undefined,
  }

  const hasSeverity = severity !== 'none'
  // Direction must follow the CONTENT, not the ambient I18nManager.forceRTL.
  // RTL content → Arabic face + explicit rtl so it reads correctly. LTR content
  // (brand names, dose forms, English fallbacks) → explicit ltr so the Unicode
  // bidi algorithm never reorders `·`/comma-separated Latin segments.
  const rtlStyle = isRtl
    ? { fontFamily: FontFamily.arabic, writingDirection: 'rtl' as const, textAlign: 'right' as const }
    : { writingDirection: 'ltr' as const }

  return (
    <View
      testID={testID}
      style={[
        styles.section,
        { backgroundColor: colors.surface, borderColor: colors.border },
        hasSeverity && {
          backgroundColor: severityBg[severity],
          borderColor: severityBorder[severity],
        },
      ]}
    >
      <Text
        style={[styles.sectionTitle, { color: colors.textSecondary }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {text && (
        <Text style={[styles.text, { color: colors.textPrimary }, rtlStyle]}>
          {text}
        </Text>
      )}
      {items?.map((item, i) => (
        <Text key={i} style={[styles.item, { color: colors.textPrimary }, rtlStyle]}>
          {'\u2022'} {item}
        </Text>
      ))}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    marginBottom: Spacing[5],
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing[4],
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[1],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
  },
  item: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
  },
})

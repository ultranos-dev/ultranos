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
    none: colors.border,
  }

  const hasSeverity = severity !== 'none'
  const rtlStyle = isRtl ? { fontFamily: FontFamily.arabic, textAlign: 'right' as const } : undefined

  return (
    <View
      testID={testID}
      style={[
        styles.section,
        hasSeverity && {
          backgroundColor: severityBg[severity],
          borderWidth: 1,
          borderColor: severityBorder[severity],
          borderRadius: Radius.md,
          padding: Spacing[3],
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

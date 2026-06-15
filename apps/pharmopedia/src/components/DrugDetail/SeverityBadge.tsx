// src/components/DrugDetail/SeverityBadge.tsx
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

type Severity = 'CONTRAINDICATED' | 'MAJOR' | 'MODERATE' | 'MINOR'

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const label = t(`drug.clinical.severity.${severity}`)

  const colorMap: Record<Severity, { bg: string; text: string }> = {
    CONTRAINDICATED: { bg: colors.dangerLight, text: colors.dangerDark },
    MAJOR:           { bg: colors.warningLight, text: colors.warningDark },
    MODERATE:        { bg: colors.warningLight, text: colors.warningDark },
    MINOR:           { bg: colors.neutral200, text: colors.neutral600 },
  }

  const { bg, text } = colorMap[severity]

  return (
    <View
      style={[styles.badge, { backgroundColor: bg }]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[2],
    paddingVertical: Spacing[1],
    borderRadius: Radius.sm,
  },
  text: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansSemibold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
})

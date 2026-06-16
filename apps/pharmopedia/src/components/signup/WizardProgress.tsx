import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTranslation } from 'react-i18next'

export function WizardProgress({ step, total }: { step: number; total: number }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: colors.surfaceSubtle }]}>
        <View testID="wizard-progress-fill" style={[styles.fill, { backgroundColor: colors.primary500, width: `${Math.round((step / total) * 100)}%` }]} />
      </View>
      <Text style={[styles.label, { color: colors.textMuted }]}>{t('signup.stepOf', { n: step, total })}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing[1] },
  track: { height: 6, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: 6, borderRadius: Radius.full },
  label: { fontFamily: FontFamily.sans, fontSize: FontSize.xs },
})

/**
 * PrescriptionHistoryScreen — Placeholder for prescription history with refill tracking.
 * Story 27.11, Task 6.2: Premium placeholder screen.
 *
 * Full implementation will be added in a future story.
 * Wrapped in PremiumGate — FREE tier patients see the upgrade prompt.
 */
import { View, Text, StyleSheet } from 'react-native'
import { PremiumGate } from '@/components/PremiumGate'
import { useTheme } from '@/theme/ThemeProvider'
import { useTranslation } from 'react-i18next'
import { consumerSpacing, consumerTypography, consumerBorderRadius } from '@/theme/consumer'

function PrescriptionHistoryContent() {
  const { colors } = useTheme()
  const { t } = useTranslation()

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="prescription-history-screen">
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {t('prescriptionHistory.title', 'Prescription History')}
        </Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {t('prescriptionHistory.comingSoon', 'Coming soon — view your complete prescription history with refill tracking.')}
        </Text>
      </View>
    </View>
  )
}

export function PrescriptionHistoryScreen() {
  const { t } = useTranslation()
  return (
    <PremiumGate
      featureId="PRESCRIPTION_HISTORY"
      featureTitle={t('premium.prescriptionHistoryTitle', 'Prescription History')}
      featureDescription={t('premium.prescriptionHistoryDescription', 'View your complete prescription history with refill tracking and medication timeline.')}
    >
      <PrescriptionHistoryContent />
    </PremiumGate>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  card: {
    width: '100%',
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding * 2,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
  },
  title: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  body: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    lineHeight: 22,
  },
})

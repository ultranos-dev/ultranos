/**
 * PremiumGate — wraps premium screens with a locked overlay for FREE tier patients.
 * Story 27.11, Task 4.
 *
 * PREMIUM tier: renders children (pass through).
 * FREE tier: renders locked overlay with feature description and upgrade CTA.
 *
 * Design: visually distinct but not alarming — secondary color with padlock icon,
 * not red/warning. This is a commercial upsell, not a safety warning.
 */
import type { ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { FeatureId } from '@ultranos/shared-types'
import { usePatientTierStore } from '@/stores/patient-tier-store'
import { useTheme } from '@/theme/ThemeProvider'
import { useTranslation } from 'react-i18next'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import type { HomeStackParamList } from '@/navigation/types'

interface PremiumGateProps {
  featureId: FeatureId
  featureTitle: string
  featureDescription: string
  monthlyPrice?: string
  children: ReactNode
}

export function PremiumGate({
  featureId,
  featureTitle,
  featureDescription,
  monthlyPrice,
  children,
}: PremiumGateProps) {
  const patientTier = usePatientTierStore((s) => s.patientTier)
  const { colors } = useTheme()
  const { t } = useTranslation()
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>()

  if (patientTier === 'PREMIUM') {
    return <>{children}</>
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface }]}
      testID={`premium-gate-${featureId}`}
      accessibilityRole="none"
      accessibilityLabel={t('premium.lockedAccessibility', 'Premium feature, upgrade required')}
    >
      <View
        style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      >
        {/* Padlock icon — text-based for simplicity, universal symbol */}
        <Text
          style={[styles.lockIcon, { color: colors.textMuted }]}
          accessibilityElementsHidden
        >
          {'\uD83D\uDD12'}
        </Text>

        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {featureTitle}
        </Text>

        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {featureDescription}
        </Text>

        {monthlyPrice && (
          <Text
            style={[styles.price, { color: colors.textPrimary }]}
            testID="premium-monthly-price"
          >
            {monthlyPrice}
          </Text>
        )}

        <Pressable
          style={[styles.ctaButton, { backgroundColor: colors.primary[500] }]}
          onPress={() => {
            try {
              navigation.navigate('SubscriptionScreen')
            } catch {
              // Navigation may fail if not in HomeStack — graceful fallback
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={t('premium.upgradeButton', 'Upgrade to Premium')}
          testID="premium-upgrade-cta"
        >
          <Text style={styles.ctaText}>
            {t('premium.upgradeButton', 'Upgrade to Premium')}
          </Text>
        </Pressable>
      </View>
    </View>
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
    gap: 16,
    borderWidth: 1,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  title: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
  },
  description: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  price: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
  },
  ctaButton: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: consumerBorderRadius.badge,
    minWidth: consumerSpacing.touchTarget * 2,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
})

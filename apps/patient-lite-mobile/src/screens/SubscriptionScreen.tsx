/**
 * SubscriptionScreen — Premium upgrade/management UI.
 * Story 27.12, Task 4.
 *
 * FREE tier: shows feature list, price, Subscribe button, Restore Purchases link.
 * PREMIUM tier: shows current plan badge, Manage Subscription link to native store.
 * RTL-compatible via logical margins and I18nManager.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
  I18nManager,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/theme/ThemeProvider'
import { usePatientTierStore } from '@/stores/patient-tier-store'
import { useAuthStore } from '@/stores/auth-store'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import {
  initIAP,
  getSubscriptionProduct,
  purchaseSubscription,
  restorePurchases,
  acknowledgePurchase,
  type IAPProduct,
  type Purchase,
} from '@/services/iap-service'
import { getPremiumProductId } from '@/config/iap'

/** Premium features shown to FREE tier users */
const PREMIUM_FEATURES = [
  { icon: '\u{1F4CB}', key: 'fullHistory', fallback: 'Full Medical History' },
  { icon: '\u{1F4E4}', key: 'recordExport', fallback: 'Health Record Export' },
  { icon: '\u{1F91D}', key: 'guardianLinking', fallback: 'Guardian Linking' },
  { icon: '\u{1F4CA}', key: 'prescriptionHistory', fallback: 'Prescription History' },
  { icon: '\u{2B50}', key: 'prioritySupport', fallback: 'Priority Support' },
] as const

export function SubscriptionScreen() {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const patientTier = usePatientTierStore((s) => s.patientTier)
  const setPatientTier = usePatientTierStore((s) => s.setPatientTier)
  const userId = useAuthStore((s) => s.userId)

  const [product, setProduct] = useState<IAPProduct | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize IAP and fetch product on mount
  useEffect(() => {
    let mounted = true
    async function loadProduct() {
      try {
        await initIAP()
        const sub = await getSubscriptionProduct()
        if (mounted) {
          setProduct(sub)
          setIsLoading(false)
        }
      } catch {
        if (mounted) {
          setError(t('subscription.loadError', 'Unable to load subscription info'))
          setIsLoading(false)
        }
      }
    }
    loadProduct()
    return () => {
      mounted = false
      // Do NOT call cleanupIAP() here — the global IAP connection is shared
      // with useSubscriptionMonitor at app root. Only the app lifecycle should
      // tear down the connection. Screen unmount only needs to stop loading.
    }
  }, [])

  // Handle subscribe tap
  const handleSubscribe = useCallback(async () => {
    if (isPurchasing || !product) return
    setIsPurchasing(true)
    setError(null)

    try {
      const productId = getPremiumProductId()
      const purchase = await purchaseSubscription(productId)

      // Extract purchase token for server validation
      // Android provides purchaseToken, iOS provides transactionId
      const purchaseToken =
        ('purchaseToken' in purchase ? (purchase as { purchaseToken?: string }).purchaseToken : undefined) ??
        ('transactionId' in purchase ? (purchase as { transactionId?: string }).transactionId : undefined) ??
        ''

      if (!purchaseToken) {
        throw new Error('No purchase token received')
      }

      // Call Hub API for server-side validation
      // In a real app, this would be a tRPC call:
      // await trpc.patient.updateTier.mutate({ patientId, tier: 'PREMIUM', purchaseToken, platform })
      // For now, update local state directly after purchase success
      setPatientTier('PREMIUM')

      // Acknowledge purchase with store
      await acknowledgePurchase(purchase)
    } catch (err: unknown) {
      // User cancellation is not an error — check structured error code
      // react-native-iap uses E_USER_CANCELLED (Android) and numeric codes (iOS)
      const errorCode = (err as { code?: string })?.code
      if (errorCode === 'E_USER_CANCELLED' || errorCode === 'E_CANCELLED') {
        // Normal user action — no error to display
      } else {
        const message =
          err instanceof Error ? err.message : 'Purchase failed'
        setError(t('subscription.purchaseError', message))
      }
    } finally {
      setIsPurchasing(false)
    }
  }, [isPurchasing, product, userId, setPatientTier, t])

  // Handle restore purchases
  const handleRestore = useCallback(async () => {
    if (isRestoring) return
    setIsRestoring(true)
    setError(null)

    try {
      const purchases = await restorePurchases()
      if (purchases.length > 0) {
        setPatientTier('PREMIUM')
      } else {
        setError(t('subscription.noRestorablePurchases', 'No previous purchases found'))
      }
    } catch {
      setError(t('subscription.restoreError', 'Unable to restore purchases'))
    } finally {
      setIsRestoring(false)
    }
  }, [isRestoring, setPatientTier, t])

  // Open native store subscription management
  const handleManageSubscription = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/account/subscriptions')
    } else {
      Linking.openURL(
        'https://play.google.com/store/account/subscriptions',
      )
    }
  }, [])

  const isRTL = I18nManager.isRTL

  if (isLoading) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.surface }, styles.centered]}
        testID="subscription-loading"
      >
        <ActivityIndicator size="large" color={colors.primary[500]} />
      </View>
    )
  }

  const isPremium = patientTier === 'PREMIUM'
  const priceText = product?.localizedPrice ?? product?.price ?? '—'

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.scrollContent}
      testID="subscription-screen"
    >
      {/* Tier Badge */}
      <View
        style={[
          styles.tierBadge,
          {
            backgroundColor: isPremium
              ? colors.success?.[100] ?? '#D4EDDA'
              : colors.neutral?.[100] ?? '#F0F0F0',
            borderColor: isPremium
              ? colors.success?.[500] ?? '#28A745'
              : colors.neutral?.[300] ?? '#CCCCCC',
          },
        ]}
        testID="tier-badge"
        accessibilityRole="text"
        accessibilityLabel={isPremium ? t('subscription.premiumPlan', 'Premium Plan') : t('subscription.freePlan', 'Free Plan')}
      >
        <Text
          style={[
            styles.tierBadgeText,
            {
              color: isPremium
                ? colors.success?.[700] ?? '#155724'
                : colors.textMuted,
            },
          ]}
        >
          {isPremium
            ? t('subscription.premiumPlan', 'Premium Plan')
            : t('subscription.freePlan', 'Free Plan')}
        </Text>
      </View>

      {isPremium ? (
        /* Premium user view — Manage Subscription */
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('subscription.youArePremium', 'You have Premium access')}
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {t('subscription.premiumDescription', 'Enjoy full access to all features. Manage your subscription through your app store.')}
          </Text>
          <Pressable
            style={[styles.manageButton, { borderColor: colors.primary[500] }]}
            onPress={handleManageSubscription}
            accessibilityRole="button"
            accessibilityLabel={t('subscription.manageButton', 'Manage Subscription')}
            testID="manage-subscription-button"
          >
            <Text style={[styles.manageButtonText, { color: colors.primary[500] }]}>
              {t('subscription.manageButton', 'Manage Subscription')}
            </Text>
          </Pressable>
        </View>
      ) : (
        /* FREE user view — Feature list + Subscribe */
        <>
          {/* Feature List */}
          <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {t('subscription.unlockPremium', 'Unlock Premium Features')}
            </Text>

            {PREMIUM_FEATURES.map((feature) => (
              <View
                key={feature.key}
                style={[styles.featureRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <Text style={styles.featureIcon} accessibilityElementsHidden>
                  {feature.icon}
                </Text>
                <Text style={[styles.featureText, { color: colors.textSecondary }]}>
                  {t(`subscription.feature.${feature.key}`, feature.fallback)}
                </Text>
              </View>
            ))}
          </View>

          {/* Price */}
          <View style={[styles.priceCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Text style={[styles.priceAmount, { color: colors.textPrimary }]} testID="subscription-price">
              {priceText}
            </Text>
            <Text style={[styles.priceLabel, { color: colors.textMuted }]}>
              {t('subscription.perMonth', '/ month')}
            </Text>
          </View>

          {/* Error message */}
          {error && (
            <Text style={[styles.errorText, { color: colors.danger?.[500] ?? '#DC3545' }]} testID="subscription-error">
              {error}
            </Text>
          )}

          {/* Subscribe Button */}
          <Pressable
            style={[
              styles.subscribeButton,
              { backgroundColor: colors.primary[500] },
              isPurchasing && styles.buttonDisabled,
            ]}
            onPress={handleSubscribe}
            disabled={isPurchasing}
            accessibilityRole="button"
            accessibilityLabel={t('subscription.subscribeButton', 'Subscribe')}
            accessibilityState={{ disabled: isPurchasing }}
            testID="subscribe-button"
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color="#FFFFFF" testID="purchase-loading" />
            ) : (
              <Text style={styles.subscribeButtonText}>
                {t('subscription.subscribeButton', 'Subscribe')}
              </Text>
            )}
          </Pressable>

          {/* Restore Purchases */}
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            accessibilityRole="button"
            accessibilityLabel={t('subscription.restoreButton', 'Restore Purchases')}
            testID="restore-purchases-button"
            style={styles.restoreButton}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.primary[500]} />
            ) : (
              <Text style={[styles.restoreText, { color: colors.primary[500] }]}>
                {t('subscription.restoreButton', 'Restore Purchases')}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingVertical: consumerSpacing.sectionGap,
    gap: consumerSpacing.sectionGap,
  },
  tierBadge: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: consumerBorderRadius.badge,
    borderWidth: 1,
  },
  tierBadgeText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding * 1.5,
    borderWidth: 1,
    gap: 16,
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
  },
  featureRow: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  featureIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  featureText: {
    fontSize: consumerTypography.bodySize,
    flex: 1,
  },
  priceCard: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  priceLabel: {
    fontSize: consumerTypography.bodySize,
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
  subscribeButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: consumerBorderRadius.badge,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: consumerSpacing.touchTarget,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.bodySize + 2,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
    minHeight: consumerSpacing.touchTarget,
  },
  restoreText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  manageButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: consumerBorderRadius.badge,
    borderWidth: 2,
    alignItems: 'center',
  },
  manageButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
})

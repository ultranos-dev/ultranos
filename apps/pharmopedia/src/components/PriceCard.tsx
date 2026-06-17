import { View, Text, StyleSheet } from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { MapPin } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { PharmacyPrice } from '@ultranos/shared-types'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useReducedMotion } from '@ultranos/ui-kit/native'

export function PriceCard({ price, index }: { price: PharmacyPrice; index?: number }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const reduced = useReducedMotion()
  const enterDelay = Math.min((index ?? 0) * 50, 500)

  const stockBorderColor = {
    in_stock:     colors.success,
    low_stock:    colors.warning,
    out_of_stock: colors.danger,
  }[price.stockSignal]

  const stockTextColor = {
    in_stock:     colors.successDark,
    low_stock:    colors.warningDark,
    out_of_stock: colors.dangerDark,
  }[price.stockSignal]

  const stockKey = {
    in_stock:     'pricing.inStock',
    low_stock:    'pricing.lowStock',
    out_of_stock: 'pricing.outOfStock',
  }[price.stockSignal]

  return (
    <Animated.View entering={reduced ? undefined : FadeInUp.delay(enterDelay).duration(300)}>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: stockBorderColor }]}
        testID={`price-card-${price.facilityId}`}
        accessibilityRole="text"
        accessibilityLabel={`${price.pharmacyName}, ${t('pricing.price', { price: price.retailPrice.toFixed(2) })}, ${t('pricing.distance', { km: price.distanceKm.toFixed(1) })}`}
      >
        <View style={styles.topRow}>
          <Text style={[styles.pharmacy, { color: colors.textPrimary }]}>{price.pharmacyName}</Text>
          <Text style={[styles.priceText, { color: colors.primary500 }]}>
            {t('pricing.price', { price: price.retailPrice.toFixed(2) })}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <View style={styles.distanceRow}>
            <MapPin size={12} color={colors.textMuted} />
            <Text style={[styles.distance, { color: colors.textMuted }]}>
              {t('pricing.distance', { km: price.distanceKm.toFixed(1) })}
            </Text>
          </View>
          <Text style={[styles.stock, { color: stockTextColor }]}>{t(stockKey)}</Text>
        </View>
        {price.doseForm && (
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {price.doseForm}{price.quantity ? ` × ${price.quantity}` : ''}
          </Text>
        )}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing[4],
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold, flex: 1 },
  priceText: { fontSize: FontSize.lg, fontFamily: FontFamily.sansBold },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[1] },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  distance: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  stock: { fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold },
  meta: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, marginTop: Spacing[1] },
})

import { View, Text, StyleSheet } from 'react-native'
import Animated, { FadeInUp } from 'react-native-reanimated'
import { MapPin } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { PharmacyPrice } from '@ultranos/shared-types'
import { FontFamily, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function PriceCard({ price, index }: { price: PharmacyPrice; index?: number }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
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
    <Animated.View entering={FadeInUp.delay(enterDelay).duration(300)}>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderLeftColor: stockBorderColor }]}
        testID={`price-card-${price.facilityId}`}
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
    borderLeftWidth: 3,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: 15, fontFamily: FontFamily.sansSemibold, flex: 1 },
  priceText: { fontSize: 17, fontFamily: FontFamily.sansBold },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[1] },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distance: { fontSize: 13, fontFamily: FontFamily.sans },
  stock: { fontSize: 13, fontFamily: FontFamily.sansSemibold },
  meta: { fontSize: 13, fontFamily: FontFamily.sans, marginTop: Spacing[1] },
})

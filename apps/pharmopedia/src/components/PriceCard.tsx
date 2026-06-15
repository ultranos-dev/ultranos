import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { PharmacyPrice } from '@ultranos/shared-types'
import { useThemeColors } from '@/hooks/useThemeColors'

export function PriceCard({ price }: { price: PharmacyPrice }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const stockKey = {
    in_stock: 'pricing.inStock',
    low_stock: 'pricing.lowStock',
    out_of_stock: 'pricing.outOfStock',
  }[price.stockSignal]

  const stockColor = {
    in_stock: colors.successDark,
    low_stock: colors.warningDark,
    out_of_stock: colors.dangerDark,
  }[price.stockSignal]

  return (
    <View style={[styles.card, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.surface }]} testID={`price-card-${price.facilityId}`}>
      <View style={styles.row}>
        <Text style={[styles.pharmacy, { color: colors.textPrimary }]}>{price.pharmacyName}</Text>
        <Text style={[styles.priceText, { color: colors.primary500 }]}>{t('pricing.price', { price: price.retailPrice.toFixed(2) })}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.distance, { color: colors.textSecondary }]}>{t('pricing.distance', { km: price.distanceKm.toFixed(1) })}</Text>
        <Text style={[styles.stock, { color: stockColor }]}>{t(stockKey)}</Text>
      </View>
      {price.doseForm && (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>{price.doseForm}{price.quantity ? ` × ${price.quantity}` : ''}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: 15, fontWeight: '600', flex: 1 },
  priceText: { fontSize: 15, fontWeight: '700' },
  distance: { fontSize: 13, marginTop: 2 },
  stock: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 13, marginTop: 4 },
})

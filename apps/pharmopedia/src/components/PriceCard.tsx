import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { PharmacyPrice } from '@ultranos/shared-types'

export function PriceCard({ price }: { price: PharmacyPrice }) {
  const { t } = useTranslation()

  const stockKey = {
    in_stock: 'pricing.inStock',
    low_stock: 'pricing.lowStock',
    out_of_stock: 'pricing.outOfStock',
  }[price.stockSignal]

  const stockColor = {
    in_stock: '#15803d',
    low_stock: '#92400e',
    out_of_stock: '#b91c1c',
  }[price.stockSignal]

  return (
    <View style={styles.card} testID={`price-card-${price.facilityId}`}>
      <View style={styles.row}>
        <Text style={styles.pharmacy}>{price.pharmacyName}</Text>
        <Text style={styles.priceText}>{t('pricing.price', { price: price.retailPrice.toFixed(2) })}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.distance}>{t('pricing.distance', { km: price.distanceKm.toFixed(1) })}</Text>
        <Text style={[styles.stock, { color: stockColor }]}>{t(stockKey)}</Text>
      </View>
      {price.doseForm && (
        <Text style={styles.meta}>{price.doseForm}{price.quantity ? ` × ${price.quantity}` : ''}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  priceText: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  distance: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  stock: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
})

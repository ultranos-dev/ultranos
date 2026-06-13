import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { getDrugPricesApi } from '@/api/drug-catalog'
import { useAuthStore } from '@/store/auth-store'
import { PriceCard } from '@/components/PriceCard'
import type { PharmacyPrice } from '@ultranos/shared-types'

type Sort = 'distance' | 'price'

export function PricingTab({ atcCode }: { atcCode: string }) {
  const { t } = useTranslation()
  const token = useAuthStore((s) => s.token)
  const [prices, setPrices] = useState<PharmacyPrice[]>([])
  const [sort, setSort] = useState<Sort>('distance')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const coordsRef = useRef<{ latitude: number; longitude: number } | null>(null)

  useEffect(() => {
    loadPrices()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, atcCode])

  async function loadPrices() {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      if (!coordsRef.current) {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          setError(t('pricing.locationRequired'))
          setLoading(false)
          return
        }
        const loc = await Location.getCurrentPositionAsync({})
        coordsRef.current = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
      }
      const { latitude, longitude } = coordsRef.current
      const results = await getDrugPricesApi(atcCode, latitude, longitude, sort, 10, token)
      setPrices(results)
    } catch {
      setError(t('pricing.unavailable'))
    }
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <View style={styles.sortRow}>
        <Pressable
          style={[styles.sortBtn, sort === 'distance' && styles.sortBtnActive]}
          onPress={() => setSort('distance')}
        >
          <Text style={[styles.sortText, sort === 'distance' && styles.sortTextActive]}>
            {t('pricing.byDistance')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortBtn, sort === 'price' && styles.sortBtnActive]}
          onPress={() => setSort('price')}
        >
          <Text style={[styles.sortText, sort === 'price' && styles.sortTextActive]}>
            {t('pricing.byPrice')}
          </Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 32 }} />}

      {!loading && error && (
        <View style={styles.errorBox} testID="pricing-error">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { coordsRef.current = null; loadPrices() }} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t('pricing.retry')}</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && prices.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('pricing.noResults')}</Text>
        </View>
      )}

      {!loading && !error && prices.length > 0 && (
        <FlatList
          data={prices}
          keyExtractor={(item) => item.facilityId}
          renderItem={({ item }) => <PriceCard price={item} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sortRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  sortBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  sortText: { fontSize: 14, color: '#374151' },
  sortTextActive: { color: '#fff' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#2563eb', borderRadius: 6 },
  retryText: { color: '#fff', fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#6b7280' },
})

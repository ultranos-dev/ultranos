import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import * as Location from 'expo-location'
import { useTranslation } from 'react-i18next'
import { MapPinOff } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { getDrugPricesApi } from '@/api/drug-catalog'
import { useAuthStore } from '@/store/auth-store'
import { PriceCard } from '@/components/PriceCard'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { PharmacyPrice } from '@ultranos/shared-types'

type Sort = 'distance' | 'price'

export function PricingTab({ atcCode }: { atcCode: string }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
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
      <View style={[styles.sortRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]} accessibilityRole="radiogroup">
        <Pressable
          style={[styles.sortBtn, { borderColor: colors.border }, sort === 'distance' && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
          onPress={() => setSort('distance')}
          accessibilityRole="radio"
          accessibilityLabel={t('pricing.byDistance')}
          accessibilityState={{ selected: sort === 'distance' }}
        >
          <Text style={[styles.sortText, { color: colors.textSecondary }, sort === 'distance' && { color: colors.white }]}>
            {t('pricing.byDistance')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.sortBtn, { borderColor: colors.border }, sort === 'price' && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
          onPress={() => setSort('price')}
          accessibilityRole="radio"
          accessibilityLabel={t('pricing.byPrice')}
          accessibilityState={{ selected: sort === 'price' }}
        >
          <Text style={[styles.sortText, { color: colors.textSecondary }, sort === 'price' && { color: colors.white }]}>
            {t('pricing.byPrice')}
          </Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 32 }} color={colors.primary500} />}

      {!loading && error && (
        <View style={styles.errorBox} testID="pricing-error">
          <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          <Pressable onPress={() => { coordsRef.current = null; loadPrices() }} style={[styles.retryBtn, { backgroundColor: colors.primary500 }]} accessibilityRole="button" accessibilityLabel={t('pricing.retry')}>
            <Text style={[styles.retryText, { color: colors.white }]}>{t('pricing.retry')}</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && prices.length === 0 && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <MapPinOff size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('pricing.emptyTitle')}</Text>
          <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>{t('pricing.emptyDescription')}</Text>
        </View>
      )}

      {!loading && !error && prices.length > 0 && (
        <FlatList
          data={prices}
          keyExtractor={(item) => item.facilityId}
          renderItem={({ item, index }) => <PriceCard price={item} index={index} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sortRow: { flexDirection: 'row', padding: Spacing[3], gap: Spacing[2], borderBottomWidth: 1 },
  sortBtn: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], borderRadius: Radius.md, borderWidth: 1 },
  sortText: { fontSize: FontSize.sm },
  errorBox: { padding: Spacing[6], alignItems: 'center' },
  errorText: { textAlign: 'center', marginBottom: Spacing[3] },
  retryBtn: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2], borderRadius: Radius.md },
  retryText: { fontWeight: '600' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[3],
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemibold,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})

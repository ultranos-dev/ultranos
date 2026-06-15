import { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/sync-store'
import { useThemeColors } from '@/hooks/useThemeColors'

export function SyncStatusBanner() {
  const { t } = useTranslation()
  const { status, lastSyncAt, syncedCount } = useSyncStore()
  const colors = useThemeColors()
  const countOpacity = useSharedValue(1)

  useEffect(() => {
    if (syncedCount > 0) {
      countOpacity.value = 0.3
      countOpacity.value = withTiming(1, { duration: 400 })
    }
  }, [syncedCount, countOpacity])

  const countAnimatedStyle = useAnimatedStyle(() => ({
    opacity: countOpacity.value,
  }))

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.infoLight }]}>
        <Animated.Text style={[styles.text, { color: colors.textPrimary }, countAnimatedStyle]}>
          {syncedCount > 0
            ? t('sync.syncingCount', { count: syncedCount })
            : t('sync.syncing')}
        </Animated.Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.dangerLight }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{t('sync.failed')}</Text>
      </View>
    )
  }

  if (!lastSyncAt) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.warningLight }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{t('sync.notSynced')}</Text>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { fontSize: 13, textAlign: 'center' },
})

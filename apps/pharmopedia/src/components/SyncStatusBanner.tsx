import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/sync-store'
import { useThemeColors } from '@/hooks/useThemeColors'

export function SyncStatusBanner() {
  const { t } = useTranslation()
  const { status, lastSyncAt } = useSyncStore()
  const colors = useThemeColors()

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.infoLight }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{t('sync.syncing')}</Text>
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

import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useSyncStore } from '@/store/sync-store'

export function SyncStatusBanner() {
  const { t } = useTranslation()
  const { status, lastSyncAt } = useSyncStore()

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, styles.syncing]}>
        <Text style={styles.text}>{t('sync.syncing')}</Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.banner, styles.error]}>
        <Text style={styles.text}>{t('sync.failed')}</Text>
      </View>
    )
  }

  if (!lastSyncAt) {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Text style={styles.text}>{t('sync.notSynced')}</Text>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  syncing: { backgroundColor: '#dbeafe' },
  error: { backgroundColor: '#fee2e2' },
  warning: { backgroundColor: '#fef9c3' },
  text: { fontSize: 13, textAlign: 'center' },
})

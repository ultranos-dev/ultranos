import { View, Text, Pressable, StyleSheet, SafeAreaView, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase } from '@/db/migrations'
import { RoleBadge } from '@/components/RoleBadge'

const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'prs', label: 'دری' },
  { value: 'ps', label: 'پښتو' },
  { value: 'ar', label: 'عربي' },
]

export default function ProfileTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const setStatus = useSyncStore((s) => s.setStatus)
  const setLastSync = useSyncStore((s) => s.setLastSync)
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)

  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    try {
      const { version } = await runSync(getDatabase(), token)
      setLastSync(version, new Date().toISOString())
    } catch {
      setStatus('error')
    }
  }

  async function handleLogout() {
    try {
      await logout(getDatabase())
    } catch {
      // clearCatalog failed — session already cleared from memory
    }
    router.replace('/(auth)/login')
  }

  function handleLangPress(selected: Lang) {
    const rtlChanges = isRtlLang(lang) !== isRtlLang(selected)
    if (rtlChanges) {
      Alert.alert(
        t('profile.languageRestartTitle'),
        t('profile.languageRestartMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' as const },
          { text: t('common.ok'), onPress: () => void setLang(selected) },
        ],
      )
    } else {
      void setLang(selected)
    }
  }

  function formatSyncTime(iso: string | null): string {
    if (!iso) return t('profile.neverSynced')
    const d = new Date(iso)
    return t('profile.lastSynced', { date: d.toLocaleDateString(), time: d.toLocaleTimeString() })
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.role')}</Text>
        {user?.role && <RoleBadge role={user.role} />}
        {user?.facilityId && (
          <Text style={styles.facility}>{t('profile.facility', { id: user.facilityId })}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.language')}</Text>
        <View style={styles.langRow}>
          {LANG_OPTIONS.map(({ value, label }) => (
            <Pressable
              key={value}
              testID={`lang-btn-${value}`}
              style={[styles.langBtn, lang === value && styles.langBtnActive]}
              onPress={() => handleLangPress(value)}
            >
              <Text style={[styles.langText, lang === value && styles.langTextActive]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>{t('profile.catalogSync')}</Text>
        <Text testID="last-synced-text" style={styles.value}>{formatSyncTime(lastSyncAt)}</Text>
        <Text style={styles.value}>{t('profile.version', { number: lastVersion })}</Text>
        {status === 'syncing' && <Text style={styles.syncing}>{t('profile.syncing')}</Text>}
        {status === 'error' && <Text style={styles.error}>{t('profile.syncFailed')}</Text>}
        <Pressable
          testID="sync-now-button"
          style={[styles.button, status === 'syncing' && styles.buttonDisabled]}
          onPress={handleSyncNow}
          disabled={status === 'syncing'}
        >
          <Text style={styles.buttonText}>
            {status === 'syncing' ? t('profile.syncing') : t('profile.syncNow')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          testID="logout-button"
          style={[styles.button, styles.logoutButton]}
          onPress={handleLogout}
        >
          <Text style={[styles.buttonText, styles.logoutText]}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 20 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 15, color: '#374151' },
  facility: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  syncing: { fontSize: 14, color: '#2563eb' },
  error: { fontSize: 14, color: '#dc2626' },
  langRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  langBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  langText: { fontSize: 14, color: '#374151' },
  langTextActive: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  logoutButton: { backgroundColor: '#fee2e2' },
  logoutText: { color: '#b91c1c' },
})

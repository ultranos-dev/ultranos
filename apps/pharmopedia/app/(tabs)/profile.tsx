import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'
import { useThemeStore, type ThemeMode } from '@/store/theme-store'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase } from '@/db/migrations'
import { RoleBadge } from '@/components/RoleBadge'
import { Colors, FontFamily, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'

const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'prs', label: 'دری' },
  { value: 'ps', label: 'پښتو' },
  { value: 'ar', label: 'عربي' },
]

const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'profile.themeLight' },
  { value: 'dark', labelKey: 'profile.themeDark' },
  { value: 'system', labelKey: 'profile.themeSystem' },
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
  const setSyncedCount = useSyncStore((s) => s.setSyncedCount)
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)

  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    setSyncedCount(0)
    try {
      const { version } = await runSync(getDatabase(), token, setSyncedCount)
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
        <Text style={styles.label}>{t('profile.appearance')}</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              testID={`theme-${opt.value}`}
              style={[styles.themeBtn, themeMode === opt.value && styles.themeBtnActive]}
              onPress={() => void setThemeMode(opt.value)}
            >
              <Text style={[styles.themeText, themeMode === opt.value && styles.themeTextActive]}>
                {t(opt.labelKey)}
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
  container: { flex: 1, backgroundColor: Colors.neutral50, padding: Spacing[5] },
  section: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    gap: Spacing[2],
  },
  label: {
    fontSize: 13,
    fontFamily: FontFamily.sansBold,
    color: Colors.neutral500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: { fontSize: 15, fontFamily: FontFamily.sans, color: Colors.neutral700 },
  facility: { fontSize: 14, fontFamily: FontFamily.sans, color: Colors.neutral500, marginTop: 4 },
  syncing: { fontSize: 14, fontFamily: FontFamily.sans, color: Colors.primary500 },
  error: { fontSize: 14, fontFamily: FontFamily.sans, color: Colors.danger },
  themeRow: { flexDirection: 'row', gap: Spacing[2] },
  themeBtn: {
    flex: 1,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.neutral200,
    alignItems: 'center',
  },
  themeBtnActive: { backgroundColor: Colors.primary500, borderColor: Colors.primary500 },
  themeText: { fontSize: 14, fontFamily: FontFamily.sansMedium, color: Colors.neutral700 },
  themeTextActive: { color: Colors.white },
  langRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.neutral200,
  },
  langBtnActive: { backgroundColor: Colors.primary500, borderColor: Colors.primary500 },
  langText: { fontSize: 14, fontFamily: FontFamily.sans, color: Colors.neutral700 },
  langTextActive: { color: Colors.white, fontFamily: FontFamily.sansSemibold },
  button: {
    backgroundColor: Colors.primary500,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontFamily: FontFamily.sansSemibold, fontSize: 15 },
  logoutButton: { backgroundColor: Colors.dangerLight },
  logoutText: { color: Colors.dangerDark },
})

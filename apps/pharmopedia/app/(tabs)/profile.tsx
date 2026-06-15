import { useRef, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useCoachMarkStore } from '@/store/coach-mark-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'
import { useThemeStore, type ThemeMode } from '@/store/theme-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase } from '@/db/migrations'
import { RoleBadge } from '@/components/RoleBadge'
import { hapticNotification, hapticSelection } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { FontFamily, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CoachMark } from '@/components/CoachMark'

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
  const colors = useThemeColors()
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

  const visitCount = useRef(0)
  useEffect(() => { visitCount.current += 1 }, [])

  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    setSyncedCount(0)
    try {
      const { version } = await runSync(getDatabase(), token, setSyncedCount)
      setLastSync(version, new Date().toISOString())
      void hapticNotification(NotificationFeedbackType.Success)
    } catch {
      setStatus('error')
      void hapticNotification(NotificationFeedbackType.Error)
    }
  }

  async function handleLogout() {
    try {
      await logout(getDatabase())
    } catch {
      // clearCatalog failed — session already cleared from memory
    }
    void useCoachMarkStore.getState().reset()
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
      void hapticSelection()
    }
  }

  function formatSyncTime(iso: string | null): string {
    if (!iso) return t('profile.neverSynced')
    const d = new Date(iso)
    return t('profile.lastSynced', { date: d.toLocaleDateString(), time: d.toLocaleTimeString() })
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.role')}</Text>
        {user?.role && <RoleBadge role={user.role} />}
        {user?.facilityId && (
          <Text style={[styles.facility, { color: colors.textSecondary }]}>{t('profile.facility', { id: user.facilityId })}</Text>
        )}
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.language')}</Text>
        <View style={styles.langRow}>
          {LANG_OPTIONS.map(({ value, label }) => (
            <Pressable
              key={value}
              testID={`lang-btn-${value}`}
              style={[styles.langBtn, { borderColor: colors.border }, lang === value && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
              onPress={() => handleLangPress(value)}
            >
              <Text style={[styles.langText, { color: colors.textSecondary }, lang === value && { color: colors.white, fontFamily: FontFamily.sansSemibold }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.appearance')}</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              testID={`theme-${opt.value}`}
              style={[styles.themeBtn, { borderColor: colors.border }, themeMode === opt.value && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
              onPress={() => { void setThemeMode(opt.value); void hapticSelection() }}
            >
              <Text style={[styles.themeText, { color: colors.textSecondary }, themeMode === opt.value && { color: colors.white }]}>
                {t(opt.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('profile.catalogSync')}</Text>
        <Text testID="last-synced-text" style={[styles.value, { color: colors.textSecondary }]}>{formatSyncTime(lastSyncAt)}</Text>
        <Text style={[styles.value, { color: colors.textSecondary }]}>{t('profile.version', { number: lastVersion })}</Text>
        {status === 'syncing' && <Text style={[styles.syncing, { color: colors.primary500 }]}>{t('profile.syncing')}</Text>}
        {status === 'error' && <Text style={[styles.error, { color: colors.danger }]}>{t('profile.syncFailed')}</Text>}
        <Pressable
          testID="sync-now-button"
          style={[styles.button, { backgroundColor: colors.primary500 }, status === 'syncing' && styles.buttonDisabled]}
          onPress={handleSyncNow}
          disabled={status === 'syncing'}
        >
          <Text style={[styles.buttonText, { color: colors.white }]}>
            {status === 'syncing' ? t('profile.syncing') : t('profile.syncNow')}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Pressable
          testID="logout-button"
          style={[styles.button, { backgroundColor: colors.dangerLight }]}
          onPress={handleLogout}
        >
          <Text style={[styles.buttonText, { color: colors.dangerDark }]}>{t('profile.logout')}</Text>
        </Pressable>
      </View>
      <CoachMark
        markKey="profile-lang"
        hint={t('coach.profileLang')}
        visible={visitCount.current >= 2}
      />
      <CoachMark
        markKey="profile-sync"
        hint={t('coach.profileSync')}
        visible={visitCount.current >= 2}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing[5] },
  section: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    gap: Spacing[2],
  },
  label: {
    fontSize: 13,
    fontFamily: FontFamily.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: { fontSize: 15, fontFamily: FontFamily.sans },
  facility: { fontSize: 14, fontFamily: FontFamily.sans, marginTop: 4 },
  syncing: { fontSize: 14, fontFamily: FontFamily.sans },
  error: { fontSize: 14, fontFamily: FontFamily.sans },
  themeRow: { flexDirection: 'row', gap: Spacing[2] },
  themeBtn: {
    flex: 1,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  themeText: { fontSize: 14, fontFamily: FontFamily.sansMedium },
  langRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  langText: { fontSize: 14, fontFamily: FontFamily.sans },
  button: {
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: FontFamily.sansSemibold, fontSize: 15 },
})

import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth-store'
import { useCoachMarkStore } from '@/store/coach-mark-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'
import { useThemeStore, type ThemeMode } from '@/store/theme-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useProfile } from '@/hooks/useProfile'
import { runSync } from '@/sync/catalog-sync'
import { runBrandsSync } from '@/sync/brands-sync'
import { getDatabase } from '@/db/migrations'
import { RoleBadge } from '@/components/RoleBadge'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { hapticNotification, hapticSelection } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CoachMark } from '@/components/CoachMark'
import {
  CollapsibleScreen,
  Avatar,
  CardSection,
  Chip,
  Banner,
  ListRow,
} from '@ultranos/ui-kit/native'

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

/** Join non-empty address parts into one readable string. */
function formatAddress(addr: { province?: string; district?: string; village?: string } | undefined): string | undefined {
  if (!addr) return undefined
  const parts = [addr.village, addr.district, addr.province].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : undefined
}

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
  const langCoachDismissed = useCoachMarkStore((s) => s.dismissed.has('profile-lang'))
  const { profile, source, loading } = useProfile()

  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    setSyncedCount(0)
    try {
      const { version } = await runSync(getDatabase(), token, setSyncedCount)
      // Branded medications sync alongside the catalog (best-effort).
      await runBrandsSync(getDatabase(), token).catch(() => {})
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

  function confirmLogout() {
    Alert.alert(
      t('profile.logoutConfirmTitle'),
      t('profile.logoutConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' as const },
        { text: t('profile.logoutConfirm'), style: 'destructive' as const, onPress: () => void handleLogout() },
      ],
    )
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

  const rtl = isRtlLang(lang)
  // In RTL, also switch translated text to the Arabic (Noto Kufi) font. `align`
  // is applied last on every bespoke <Text>, so its fontFamily overrides the
  // Manrope/Public Sans default from the base style.
  const align = rtl
    ? { textAlign: 'right' as const, fontFamily: FontFamily.arabic }
    : { textAlign: 'left' as const }

  // ── Identity header ──────────────────────────────────────────────────────

  function renderIdentityHeader() {
    if (loading && !profile) {
      // Lightweight placeholder: avatar circle + name placeholder
      return (
        <View style={[styles.identityPlaceholder, { backgroundColor: colors.surface }]}>
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.border }]} />
          <View style={styles.identityPlaceholderText}>
            <View style={[styles.placeholderLine, { backgroundColor: colors.border, width: 120 }]} />
            <View style={[styles.placeholderLine, { backgroundColor: colors.border, width: 80, marginTop: Spacing[1] }]} />
          </View>
        </View>
      )
    }

    const displayName = profile?.displayName ?? ''
    const photoUri = profile?.kind === 'patient' ? profile.photoUrl : undefined

    return (
      <View style={[styles.identityHeader, rtl && styles.rowRtl, { backgroundColor: colors.surface }]}>
        <Avatar
          testID="profile-avatar"
          name={displayName}
          photoUri={photoUri}
          size={60}
        />
        <View style={styles.identityInfo}>
          <Text testID="profile-name" style={[styles.displayName, { color: colors.textPrimary }, align]}>
            {displayName}
          </Text>
          <View style={[styles.chipRow, rtl && styles.rowRtl]}>
            {profile?.kind === 'patient' && (
              <>
                <Chip
                  testID="profile-account-type"
                  label={t('profile.patient')}
                />
                <Chip
                  label={profile.tier === 'PREMIUM' ? t('profile.premium') : t('profile.free')}
                />
              </>
            )}
            {profile?.kind === 'practitioner' && (
              <Chip
                testID="profile-account-type"
                label={t('profile.practitioner')}
              />
            )}
            {!profile && (
              <Chip
                testID="profile-account-type"
                label={user?.role ?? ''}
              />
            )}
          </View>
        </View>
      </View>
    )
  }

  // ── Identity cards ────────────────────────────────────────────────────────

  function renderPatientCards() {
    if (!profile || profile.kind !== 'patient') return null
    const addressStr = formatAddress(profile.currentAddress)

    const accountRows = [
      profile.phone ? <ListRow key="phone" label={t('profile.phone')} value={profile.phone} /> : null,
    ].filter(Boolean)

    const patientRows = [
      profile.gender ? <ListRow key="gender" label={t('profile.gender')} value={profile.gender} /> : null,
      profile.age != null ? <ListRow key="age" label={t('profile.age')} value={String(profile.age)} /> : null,
      profile.bloodGroup ? <ListRow key="blood" label={t('profile.bloodGroup')} value={profile.bloodGroup} /> : null,
      addressStr ? <ListRow key="addr" label={t('profile.currentAddress')} value={addressStr} /> : null,
      profile.preferredLanguage ? <ListRow key="lang" label={t('profile.preferredLanguage')} value={profile.preferredLanguage} /> : null,
    ].filter(Boolean)

    return (
      <>
        <CardSection label={t('profile.accountType')}>
          {accountRows.length > 0 ? accountRows : <ListRow label={t('profile.patient')} value="" />}
        </CardSection>
        {patientRows.length > 0 && (
          <CardSection>
            {patientRows}
          </CardSection>
        )}
      </>
    )
  }

  function renderPractitionerCards() {
    if (!profile || profile.kind !== 'practitioner') return null

    const rows = [
      profile.role ? <ListRow key="role" label={t('profile.role')} value={profile.role} /> : null,
      profile.email ? <ListRow key="email" label={t('profile.email')} value={profile.email} /> : null,
      profile.phone ? <ListRow key="phone" label={t('profile.phone')} value={profile.phone} /> : null,
      profile.organization ? <ListRow key="org" label={t('profile.organization')} value={profile.organization} /> : null,
      profile.facility ? <ListRow key="fac" label={t('profile.facility')} value={profile.facility} /> : null,
      profile.qualificationDisplay ? <ListRow key="qual" label={t('profile.qualification')} value={profile.qualificationDisplay} /> : null,
      profile.licenseId ? <ListRow key="lic" label={t('profile.license')} value={profile.licenseId} /> : null,
      profile.licenseExpiry ? <ListRow key="exp" label={t('profile.licenseExpiry')} value={profile.licenseExpiry} /> : null,
      profile.status ? <ListRow key="status" label={t('profile.status')} value={profile.status} /> : null,
    ].filter(Boolean)

    if (rows.length === 0) return null
    return (
      <CardSection label={t('profile.accountType')}>
        {rows}
      </CardSection>
    )
  }

  return (
    <CollapsibleScreen title={t('tabs.profile')}>
      <NetStatusBanner />

      {/* Offline banner */}
      {source === 'none' && !loading && (
        <Banner
          testID="profile-offline-banner"
          variant="warning"
          text={t('profile.offlineProfileBanner')}
        />
      )}

      {/* Identity header */}
      {renderIdentityHeader()}

      {/* Identity cards */}
      {renderPatientCards()}
      {renderPractitionerCards()}

      {/* Fallback role section when no profile loaded */}
      {!profile && !loading && (
        <View style={[styles.section, { backgroundColor: colors.surface }]}>
          <Text style={[styles.label, { color: colors.textSecondary }, align]}>{t('profile.role')}</Text>
          {user?.role && <RoleBadge role={user.role} />}
          {user?.facilityId && (
            <Text style={[styles.facility, { color: colors.textSecondary }, align]}>{`${t('profile.facility')}: ${user.facilityId}`}</Text>
          )}
        </View>
      )}

      {/* ── PRESERVED: Preferences section ───────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textSecondary }, align]}>{t('profile.preferences')}</Text>

        <Text style={[styles.sublabel, { color: colors.textSecondary }, align]}>{t('profile.language')}</Text>
        <View style={[styles.langRow, rtl && styles.rowRtl]} accessibilityRole="radiogroup">
          {LANG_OPTIONS.map(({ value, label }) => (
            <Pressable
              key={value}
              testID={`lang-btn-${value}`}
              style={[styles.langBtn, { borderColor: colors.border }, lang === value && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
              onPress={() => handleLangPress(value)}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected: lang === value }}
            >
              <Text style={[styles.langText, { color: colors.textSecondary }, lang === value && { color: colors.white, fontFamily: FontFamily.sansSemibold }, value !== 'en' && styles.arabic]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sublabel, { color: colors.textSecondary, marginTop: Spacing[3] }, align]}>{t('profile.appearance')}</Text>
        <View style={[styles.themeRow, rtl && styles.rowRtl]} accessibilityRole="radiogroup">
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              testID={`theme-${opt.value}`}
              style={[styles.themeBtn, { borderColor: colors.border }, themeMode === opt.value && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
              onPress={() => { void setThemeMode(opt.value); void hapticSelection() }}
              accessibilityRole="radio"
              accessibilityLabel={t(opt.labelKey)}
              accessibilityState={{ selected: themeMode === opt.value }}
            >
              <Text style={[styles.themeText, { color: colors.textSecondary }, themeMode === opt.value && { color: colors.white }, rtl && styles.arabic]}>
                {t(opt.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── PRESERVED: Catalog sync section ──────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.label, { color: colors.textSecondary }, align]}>{t('profile.catalogSync')}</Text>
        <Text testID="last-synced-text" style={[styles.value, { color: colors.textSecondary }, align]}>{formatSyncTime(lastSyncAt)}</Text>
        <Text style={[styles.value, { color: colors.textSecondary }, align]}>{t('profile.version', { number: lastVersion })}</Text>
        {status === 'syncing' && <Text style={[styles.syncing, { color: colors.primary500 }, align]}>{t('profile.syncing')}</Text>}
        {status === 'error' && <Text style={[styles.error, { color: colors.danger }, align]}>{t('profile.syncFailed')}</Text>}
        <Pressable
          testID="sync-now-button"
          style={[styles.button, { backgroundColor: colors.primary500 }, status === 'syncing' && styles.buttonDisabled]}
          onPress={handleSyncNow}
          disabled={status === 'syncing'}
          accessibilityRole="button"
          accessibilityLabel={status === 'syncing' ? t('profile.syncing') : t('profile.syncNow')}
          accessibilityState={{ disabled: status === 'syncing' }}
        >
          <Text style={[styles.buttonText, { color: colors.white }, rtl && styles.arabic]}>
            {status === 'syncing' ? t('profile.syncing') : t('profile.syncNow')}
          </Text>
        </Pressable>
        <Pressable
          testID="show-tips-button"
          style={[styles.tipsButton]}
          onPress={() => { void useCoachMarkStore.getState().reset(); void hapticSelection() }}
          accessibilityRole="button"
          accessibilityLabel={t('profile.showTips')}
        >
          <Text style={[styles.tipsText, { color: colors.primary500 }, rtl && styles.arabic]}>{t('profile.showTips')}</Text>
        </Pressable>
      </View>

      {/* ── PRESERVED: Logout section ─────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Pressable
          testID="logout-button"
          style={[styles.button, { backgroundColor: colors.dangerLight }]}
          onPress={confirmLogout}
          accessibilityRole="button"
          accessibilityLabel={t('profile.logout')}
        >
          <Text style={[styles.buttonText, { color: colors.dangerDark }, rtl && styles.arabic]}>{t('profile.logout')}</Text>
        </Pressable>
      </View>

      {/* ── PRESERVED: CoachMarks ─────────────────────────────────────────── */}
      <CoachMark
        markKey="profile-lang"
        hint={t('coach.profileLang')}
        visible
      />
      <CoachMark
        markKey="profile-sync"
        hint={t('coach.profileSync')}
        visible={langCoachDismissed}
      />
    </CollapsibleScreen>
  )
}

const styles = StyleSheet.create({
  // Identity header
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  identityInfo: {
    flex: 1,
    gap: Spacing[2],
  },
  displayName: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.headingBold,
  },
  chipRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  // Loading placeholder
  identityPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  identityPlaceholderText: {
    flex: 1,
  },
  placeholderLine: {
    height: 12,
    borderRadius: Radius.sm,
  },
  // Preserved styles
  section: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
    gap: Spacing[2],
  },
  label: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing[1],
  },
  sublabel: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansMedium,
    marginBottom: Spacing[1],
  },
  value: { fontSize: FontSize.base, fontFamily: FontFamily.sans },
  facility: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, marginTop: Spacing[1] },
  syncing: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  error: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  rowRtl: { flexDirection: 'row-reverse' },
  arabic: { fontFamily: FontFamily.arabic },
  themeRow: { flexDirection: 'row', gap: Spacing[2] },
  themeBtn: {
    flex: 1,
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  themeText: { fontSize: FontSize.sm, fontFamily: FontFamily.sansMedium },
  langRow: { flexDirection: 'row', gap: Spacing[2], flexWrap: 'wrap' },
  langBtn: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[1],
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  langText: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  button: {
    borderRadius: Radius.md,
    padding: Spacing[3],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.base },
  tipsButton: {
    marginTop: Spacing[2],
    alignItems: 'center',
  },
  tipsText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
})

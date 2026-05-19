import { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  I18nManager,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAppLocale } from '@/hooks/useAppLocale'
import { formatDate as formatDateLocale } from '@ultranos/ui-kit/utils/format'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { FhirPatient } from '@ultranos/shared-types'
import { PatientQRCode } from '@/components/PatientQRCode'
import { AllergyBanner } from '@/components/AllergyBanner'
import { PatientHealthCard } from '@/components/PatientHealthCard'
import { PatientSummaryCard } from '@/components/PatientSummaryCard'
import { DashboardSkeleton } from '@/components/DashboardSkeleton'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { useMedicalHistory } from '@/hooks/useMedicalHistory'
import { useUnreadNotificationCount } from '@/hooks/useUnreadNotificationCount'
import { NAV_ICONS } from '@/config/icon-vocabulary'
import type { HomeStackParamList } from '@/navigation/types'

type HomeDashboardNavProp = NativeStackNavigationProp<HomeStackParamList, 'HomeScreen'>

export function HomeDashboardScreen() {
  const { t } = useTranslation()
  const { locale } = useAppLocale()
  const { colors } = useTheme()
  const navigation = useNavigation<HomeDashboardNavProp>()
  const { patient, isLoading: profileLoading, refresh: refreshProfile } = usePatientProfile()
  const {
    events,
    activeMedications,
    activeAllergies,
    isLoading: historyLoading,
    error: historyError,
    refresh: refreshHistory,
  } = useMedicalHistory(patient?.id, locale)
  const unreadCount = useUnreadNotificationCount()
  const [refreshing, setRefreshing] = useState(false)

  const isLoading = profileLoading || historyLoading

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshProfile(), refreshHistory()])
    } finally {
      setRefreshing(false)
    }
  }, [refreshProfile, refreshHistory])

  const lastEncounterDate = useMemo(() => {
    const encounter = events.find((e) => e.type === 'encounter')
    return encounter?.date ?? null
  }, [events])

  const lastPrescriptionDate = useMemo(() => {
    const med = events.find((e) => e.type === 'medication')
    return med?.date ?? null
  }, [events])

  const navigateToTimeline = useCallback(() => {
    const parent = navigation.getParent()
    parent?.navigate('TimelineTab')
  }, [navigation])

  const navigateToNotifications = useCallback(() => {
    const parent = navigation.getParent()
    parent?.navigate('NotificationsTab')
  }, [navigation])

  const navigateToQRFullScreen = useCallback(() => {
    navigation.navigate('QRFullScreen')
  }, [navigation])

  // Loading state
  if (isLoading && !patient) {
    return <DashboardSkeleton />
  }

  // Empty state (new patient, no data)
  if (!patient) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.surface }, styles.emptyContainer]} testID="dashboard-empty">
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={[styles.subheaderText, { color: colors.textPrimary }]}>
          {t('dashboard.emptyTitle')}
        </Text>
        <Text style={[styles.bodyText, { color: colors.textSecondary }, styles.emptySubtitle]}>
          {t('dashboard.emptySubtitle')}
        </Text>
      </View>
    )
  }

  // Determine QR expiry days
  const qrExpiryDays = 30 // Per PRD HP-011: 30-day expiry

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.surface }]}
      contentContainerStyle={styles.scrollContent}
      testID="home-dashboard"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary[500]}
        />
      }
    >
      {/* Dashboard Header with notification badge */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('dashboard.title')}</Text>
          {unreadCount > 0 && (
            <Pressable
              onPress={navigateToNotifications}
              style={styles.notificationButton}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.bellUnreadAccessibility', { count: unreadCount })}
              testID="notification-badge"
            >
              <Text style={styles.bellIcon}>{NAV_ICONS.notifications.emoji}</Text>
              <View style={[styles.badge, { backgroundColor: colors.error }]}>
                <Text style={styles.badgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {/* SECTION 1: Allergies — ALWAYS FIRST per CLAUDE.md rule #4 */}
      <AllergyBanner allergies={activeAllergies} isLoading={historyLoading} error={historyError} />

      {/* SECTION 2: Patient Summary Card */}
      <PatientSummaryCard patient={patient} />

      {/* SECTION 3: QR Code */}
      <Pressable
        onPress={navigateToQRFullScreen}
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.qrTapHint')}
        testID="qr-section"
      >
        <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }, styles.qrCard]}>
          <Text style={[styles.subheaderText, { color: colors.textPrimary }, styles.qrTitle]}>
            {t('passport.qrTitle')}
          </Text>
          <PatientQRCode patientId={patient.id} />
          <QRValidityIndicator expiryDays={qrExpiryDays} hasSignature={false} />
          <Text style={[styles.captionText, { color: colors.textMuted }, styles.qrHint]}>
            {t('dashboard.qrTapHint')}
          </Text>
        </View>
      </Pressable>

      {/* SECTION 4: Medications Summary */}
      <MedicationsSection
        count={activeMedications.length}
        onViewAll={navigateToTimeline}
      />

      {/* SECTION 5: Recent Activity */}
      <RecentActivitySection
        lastEncounterDate={lastEncounterDate}
        lastPrescriptionDate={lastPrescriptionDate}
        locale={locale}
      />

      {/* SECTION 6: Settings — Theme Toggle (AC #1) */}
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="settings-section">
        <ThemeToggle />
      </View>
    </ScrollView>
  )
}

// --- QR Validity Indicator ---

function QRValidityIndicator({
  expiryDays,
  hasSignature,
}: {
  expiryDays: number
  hasSignature: boolean
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  return (
    <View style={styles.qrBadgeRow}>
      {expiryDays > 0 ? (
        <View style={[styles.badgePill, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]} testID="qr-valid-badge">
          <Text style={[styles.badgePillText, { color: colors.successText }]}>
            {t('dashboard.qrValidDays', { days: expiryDays })}
          </Text>
        </View>
      ) : (
        <View style={[styles.badgePill, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]} testID="qr-expired-badge">
          <Text style={[styles.badgePillText, { color: colors.dangerText }]}>
            {t('dashboard.qrExpired')}
          </Text>
        </View>
      )}
      {hasSignature ? (
        <View style={[styles.badgePill, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]} testID="qr-verified-badge">
          <Text style={[styles.badgePillText, { color: colors.successText }]}>
            ✓ {t('dashboard.qrVerified')}
          </Text>
        </View>
      ) : (
        <View style={[styles.badgePill, { backgroundColor: colors.warningBg, borderColor: colors.warningBorder }]} testID="qr-unverified-badge">
          <Text style={[styles.badgePillText, { color: colors.warningText }]}>
            {t('dashboard.qrUnverified')}
          </Text>
        </View>
      )}
    </View>
  )
}

// --- Medications Section ---

function MedicationsSection({
  count,
  onViewAll,
}: {
  count: number
  onViewAll: () => void
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="medications-section">
      <View style={styles.sectionRow}>
        <View style={styles.sectionIconRow}>
          <Text style={styles.sectionIcon}>{NAV_ICONS.prescriptions.emoji}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            {count > 0
              ? t('dashboard.activeMedications', { count })
              : t('dashboard.noActiveMedications')}
          </Text>
        </View>
        {count > 0 && (
          <Pressable
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel={t('dashboard.viewAllMedications')}
            testID="medications-view-all"
          >
            <Text style={[styles.viewAllLink, { color: colors.primary[600] }]}>{t('dashboard.viewAll')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

// --- Recent Activity Section ---

function RecentActivitySection({
  lastEncounterDate,
  lastPrescriptionDate,
  locale,
}: {
  lastEncounterDate: string | null
  lastPrescriptionDate: string | null
  locale: string
}) {
  const { t } = useTranslation()
  const { colors } = useTheme()

  if (!lastEncounterDate && !lastPrescriptionDate) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="recent-activity-empty">
        <View style={styles.sectionIconRow}>
          <Text style={styles.sectionIcon}>📅</Text>
          <Text style={[styles.bodyText, { color: colors.textMuted }]}>
            {t('dashboard.noRecentActivity')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} testID="recent-activity-section">
      <Text style={[styles.subheaderText, { color: colors.textPrimary }, styles.sectionTitle]}>
        {t('dashboard.recentActivity')}
      </Text>
      {lastEncounterDate && (
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>🩺</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]} testID="last-encounter-date">
            {t('dashboard.lastVisit', { date: formatDateLocale(lastEncounterDate, locale as any) || '—' })}
          </Text>
        </View>
      )}
      {lastPrescriptionDate && (
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>{NAV_ICONS.prescriptions.emoji}</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]} testID="last-prescription-date">
            {t('dashboard.lastPrescription', { date: formatDateLocale(lastPrescriptionDate, locale as any) || '—' })}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  scrollContent: {
    paddingVertical: consumerSpacing.sectionGap,
    gap: consumerSpacing.sectionGap,
  },
  header: {
    gap: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  subheaderText: {
    fontSize: consumerTypography.subheaderSize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  bodyText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightBody,
    lineHeight: 24,
  },
  captionText: {
    fontSize: consumerTypography.captionSize,
  },
  card: {
    borderRadius: consumerBorderRadius.card,
    padding: consumerSpacing.cardPadding,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
  },
  notificationButton: {
    position: 'relative',
    padding: 8,
    minWidth: consumerSpacing.touchTarget,
    minHeight: consumerSpacing.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 24,
    writingDirection: 'ltr',
  },
  badge: {
    position: 'absolute',
    top: 2,
    ...(I18nManager.isRTL ? { left: 0 } : { right: 0 }),
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  // QR section
  qrCard: {
    alignItems: 'center',
    gap: 8,
  },
  qrTitle: {
    textAlign: 'center',
  },
  qrHint: {
    textAlign: 'center',
    fontStyle: 'italic',
  },
  qrBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgePillText: {
    fontSize: consumerTypography.captionSize,
    fontWeight: '600',
  },
  // Medications & activity sections
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionIcon: {
    fontSize: 22,
    writingDirection: 'ltr',
  },
  sectionTitle: {
    marginBottom: 8,
  },
  viewAllLink: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  activityIcon: {
    fontSize: 18,
    writingDirection: 'ltr',
  },
  // Empty state
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 64,
    writingDirection: 'ltr',
  },
  emptySubtitle: {
    textAlign: 'center',
    paddingHorizontal: 32,
  },
})

/**
 * NotificationDetailScreen — Shows full notification detail.
 * Story 18.6, Task 4.
 *
 * AC #4: Tapping marks as acknowledged, shows detail content.
 * Type-specific actions:
 *   - Lab result: "View Result" (future link)
 *   - Prescription: "View Prescription" (navigates to Timeline)
 *   - Consent change: "View Privacy Settings" (navigates to Privacy tab)
 */
import { useEffect, useCallback, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import { useNotificationStore } from '@/stores/notification-store'
import type { NotificationsStackScreenProps } from '@/navigation/types'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { GuidanceDisplay } from '@/components/guidance/GuidanceDisplay'
import { getGuidanceById } from '@/data/guidance-bundle'
import type { GuidanceContentBundle } from '@/types/guidance'

function notificationLabel(type: string, t: (key: string) => string): string {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE': return t('notifications.labResultAvailable')
    case 'LAB_RESULT_ESCALATION': return t('notifications.labResultEscalation')
    case 'PRESCRIPTION_READY': return t('notifications.prescriptionReady')
    case 'CONSENT_CHANGE': return t('notifications.consentChange')
    default: return t('notifications.notificationDefault')
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NotificationDetailScreen({
  route,
}: NotificationsStackScreenProps<'NotificationDetailScreen'>) {
  const { notificationId } = route.params
  const { t } = useTranslation()
  const { colors } = useTheme()
  const navigation = useNavigation()
  const { notifications, markAsRead } = useNotificationStore()
  const [acknowledgedGuidanceIds, setAcknowledgedGuidanceIds] = useState<Set<string>>(new Set())

  const notification = notifications.find(n => n.id === notificationId)

  // AC #4: Mark as read on open
  useEffect(() => {
    if (notification && notification.status !== 'ACKNOWLEDGED') {
      markAsRead(notificationId)
    }
  }, [notification, notificationId, markAsRead])

  const handleAction = useCallback(() => {
    if (!notification) return

    switch (notification.type) {
      case 'PRESCRIPTION_READY':
        // Navigate to Timeline tab
        navigation.getParent()?.navigate('TimelineTab')
        break
      case 'CONSENT_CHANGE':
        // Navigate to Privacy tab
        navigation.getParent()?.navigate('PrivacyTab')
        break
      case 'LAB_RESULT_AVAILABLE':
      case 'LAB_RESULT_ESCALATION':
        // Future: deep-link to lab result detail
        break
    }
  }, [notification, navigation])

  // Type config with themed fallback
  const TYPE_CONFIG: Record<string, { bg: string; icon: string }> = {
    LAB_RESULT_AVAILABLE: { bg: '#DBEAFE', icon: '\u{1F9EA}' },
    LAB_RESULT_ESCALATION: { bg: '#FEE2E2', icon: '\u{26A0}\u{FE0F}' },
    PRESCRIPTION_READY: { bg: '#D1FAE5', icon: '\u{1F48A}' },
    CONSENT_CHANGE: { bg: '#EDE9FE', icon: '\u{1F6E1}\u{FE0F}' },
  }

  if (!notification) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => navigation.goBack()} accessibilityLabel={t('notifications.backAccessibility')}>
            <Text style={[styles.backButton, { color: colors.textPrimary }]}>{'\u2190'}</Text>
          </Pressable>
          <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('notifications.detailTitle')}</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>{t('notifications.notificationDefault')}</Text>
        </View>
      </View>
    )
  }

  const config = TYPE_CONFIG[notification.type] ?? { bg: colors.surfaceElevated, icon: '\u{1F514}' }
  const isEscalation = notification.type === 'LAB_RESULT_ESCALATION'

  const actionLabel = (() => {
    switch (notification.type) {
      case 'LAB_RESULT_AVAILABLE':
      case 'LAB_RESULT_ESCALATION':
        return t('notifications.viewResult')
      case 'PRESCRIPTION_READY':
        return t('notifications.viewPrescription')
      case 'CONSENT_CHANGE':
        return t('notifications.viewPrivacySettings')
      default:
        return null
    }
  })()

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="notification-detail-screen">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('notifications.backAccessibility')}
          accessibilityRole="button"
        >
          <Text style={[styles.backButton, { color: colors.textPrimary }]}>{'\u2190'}</Text>
        </Pressable>
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>{t('notifications.detailTitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Type badge */}
        <View style={[styles.typeBanner, { backgroundColor: config.bg }, isEscalation && styles.typeBannerEscalation]}>
          <Text style={styles.typeBannerIcon}>{config.icon}</Text>
          <Text style={[styles.typeBannerText, { color: colors.textPrimary }, isEscalation && styles.typeBannerTextEscalation]}>
            {notificationLabel(notification.type, t)}
          </Text>
          {isEscalation && (
            <View style={styles.urgentBadge}>
              <Text style={styles.urgentBadgeText}>{t('notifications.urgent')}</Text>
            </View>
          )}
        </View>

        {/* Title */}
        {notification.title ? (
          <Text style={[styles.title, { color: colors.textPrimary }]}>{notification.title}</Text>
        ) : null}

        {/* Body */}
        {notification.body ? (
          <Text style={[styles.body, { color: colors.textSecondary }]}>{notification.body}</Text>
        ) : null}

        {/* Metadata detail */}
        {notification.payload?.testCategory ? (
          <Text style={[styles.detail, { color: colors.textMuted }]}>
            {notification.payload.testCategory}
            {notification.payload.labName ? ` \u2014 ${notification.payload.labName}` : ''}
          </Text>
        ) : null}

        {/* Timestamp */}
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatDate(notification.createdAt)}</Text>

        {/* Type-specific action button */}
        {actionLabel && (
          <Pressable
            onPress={handleAction}
            style={[
              styles.actionButton,
              { backgroundColor: colors.primary[600] },
              isEscalation && styles.actionButtonEscalation,
            ]}
            accessibilityRole="button"
            testID="notification-action-button"
          >
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </Pressable>
        )}

        {/* Public health guidance — shown for LAB_RESULT_AVAILABLE when guidance triggered */}
        {notification.type === 'LAB_RESULT_AVAILABLE' &&
          Array.isArray(notification.payload?.guidanceContentIds) &&
          (notification.payload.guidanceContentIds as string[]).map((guidanceId) => {
            const content: GuidanceContentBundle | undefined = getGuidanceById(guidanceId)
            if (!content) return null
            return (
              <View key={guidanceId} style={styles.guidanceSection}>
                <GuidanceDisplay
                  content={content}
                  onAcknowledge={(id) =>
                    setAcknowledgedGuidanceIds((prev) => new Set([...prev, id]))
                  }
                  isAcknowledged={acknowledgedGuidanceIds.has(guidanceId)}
                />
              </View>
            )
          })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingVertical: consumerSpacing.md,
    borderBottomWidth: 1,
    gap: consumerSpacing.md,
  },
  headerText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
  },
  backButton: {
    fontSize: 24,
    paddingEnd: consumerSpacing.sm,
  },
  content: {
    padding: consumerSpacing.screenPadding,
  },

  // Type banner
  typeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: consumerSpacing.md,
    borderRadius: consumerBorderRadius.card,
    marginBottom: consumerSpacing.lg,
  },
  typeBannerEscalation: {
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  typeBannerIcon: {
    fontSize: 24,
    marginEnd: consumerSpacing.sm,
    writingDirection: 'ltr',
  },
  typeBannerText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: '600',
    flex: 1,
  },
  typeBannerTextEscalation: {
    color: '#DC2626',
  },
  urgentBadge: {
    backgroundColor: '#DC2626',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  urgentBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  title: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    marginBottom: consumerSpacing.sm,
  },
  body: {
    fontSize: consumerTypography.bodySize,
    lineHeight: 24,
    marginBottom: consumerSpacing.md,
  },
  detail: {
    fontSize: consumerTypography.captionSize,
    marginBottom: consumerSpacing.sm,
  },
  timestamp: {
    fontSize: consumerTypography.captionSize,
    marginBottom: consumerSpacing.xl,
  },

  actionButton: {
    paddingVertical: consumerSpacing.md,
    borderRadius: consumerBorderRadius.button,
    alignItems: 'center',
  },
  actionButtonEscalation: {
    backgroundColor: '#DC2626',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.bodySize,
    fontWeight: '600',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: consumerTypography.bodySize,
  },
  guidanceSection: {
    marginTop: consumerSpacing.lg,
  },
})

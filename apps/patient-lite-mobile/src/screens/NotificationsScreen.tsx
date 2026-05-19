/**
 * NotificationsScreen — Full notification center with type-specific cards.
 * Story 18.6, Task 3.
 *
 * AC #1: FlatList of notifications, newest-first
 * AC #2: Type-specific colors and icons
 * AC #3: Unread bold/elevated, read muted
 * AC #5: Escalation red border, "Urgent" badge, haptic feedback
 * AC #9: Pull-to-refresh
 * AC #10: Empty state with bell icon and translated message
 */
import { useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  AppState,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useFocusEffect } from '@react-navigation/native'
import * as Haptics from 'expo-haptics'
import { useNotificationStore } from '@/stores/notification-store'
import type { NotificationItem } from '@/lib/notification-api'
import type { NotificationsStackScreenProps } from '@/navigation/types'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import { SAFETY_COLORS } from '@/theme/colors'

// --- Type-specific configuration ---

const TYPE_ICONS: Record<string, { icon: string; iconLabel: string }> = {
  LAB_RESULT_AVAILABLE: { icon: '\u{1F9EA}', iconLabel: 'Lab flask' },
  LAB_RESULT_ESCALATION: { icon: '\u{26A0}\u{FE0F}', iconLabel: 'Urgent' },
  PRESCRIPTION_READY: { icon: '\u{1F48A}', iconLabel: 'Pill' },
  CONSENT_CHANGE: { icon: '\u{1F6E1}\u{FE0F}', iconLabel: 'Shield' },
}

const DEFAULT_ICON = { icon: '\u{1F514}', iconLabel: 'Notification' }

function getTypeConfig(
  type: string,
  notificationColors: Record<string, { bg: string; borderColor?: string }>,
  colors: { surfaceElevated: string },
) {
  const icons = TYPE_ICONS[type] ?? DEFAULT_ICON
  const nc = notificationColors[type]
  return {
    ...icons,
    bg: nc?.bg ?? colors.surfaceElevated,
    borderColor: nc?.borderColor,
  }
}

// --- Timestamp formatting ---

function formatTimestamp(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return t('notifications.justNow')
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return t('notifications.justNow')
  if (diffMin < 60) return t('notifications.minutesAgo', { count: diffMin })
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return t('notifications.hoursAgo', { count: diffHrs })
  return d.toLocaleDateString()
}

function notificationLabel(type: string, t: (key: string) => string): string {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE': return t('notifications.labResultAvailable')
    case 'LAB_RESULT_ESCALATION': return t('notifications.labResultEscalation')
    case 'PRESCRIPTION_READY': return t('notifications.prescriptionReady')
    case 'CONSENT_CHANGE': return t('notifications.consentChange')
    default: return t('notifications.notificationDefault')
  }
}

// --- NotificationCard component ---

function NotificationCard({
  item,
  onPress,
  hapticFired,
}: {
  item: NotificationItem
  onPress: (item: NotificationItem) => void
  hapticFired: React.MutableRefObject<Set<string>>
}) {
  const { t } = useTranslation()
  const { colors, notificationColors } = useTheme()
  const isUnread = item.status !== 'ACKNOWLEDGED'
  const isEscalation = item.type === 'LAB_RESULT_ESCALATION'
  const config = getTypeConfig(item.type, notificationColors, colors)

  // AC #5: Haptic feedback on first display of escalation notifications
  useEffect(() => {
    if (isEscalation && !hapticFired.current.has(item.id)) {
      hapticFired.current.add(item.id)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {
        // Haptics unavailable on some devices
      })
    }
  }, [isEscalation, item.id, hapticFired])

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: isUnread ? config.bg : colors.surface, borderColor: colors.border },
        isUnread && styles.cardElevated,
        isEscalation && styles.cardEscalation,
        isEscalation && { borderColor: config.borderColor ?? SAFETY_COLORS.escalation },
        pressed && styles.cardPressed,
      ]}
      accessibilityLabel={`${notificationLabel(item.type, t)}. ${item.title || ''}. ${formatTimestamp(item.createdAt, t)}`}
      accessibilityRole="button"
      testID={`notification-card-${item.id}`}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.surfaceElevated }]}>
        <Text style={styles.iconText}>{config.icon}</Text>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Text
            style={[
              {
                fontSize: consumerTypography.bodySize,
                color: colors.textSecondary,
                flexShrink: 1,
              },
              isUnread && { fontWeight: '700', color: colors.textPrimary },
              isEscalation && { color: SAFETY_COLORS.escalation },
            ]}
            numberOfLines={1}
          >
            {notificationLabel(item.type, t)}
          </Text>
          {isEscalation && (
            <View style={[styles.urgentBadge, { backgroundColor: SAFETY_COLORS.urgentBg }]} testID="urgent-badge">
              <Text style={styles.urgentBadgeText}>{t('notifications.urgent')}</Text>
            </View>
          )}
        </View>

        {item.title ? (
          <Text style={{ fontSize: consumerTypography.bodySize, color: colors.textPrimary, marginTop: 2 }} numberOfLines={2}>
            {item.title}
          </Text>
        ) : null}

        {item.payload?.testCategory ? (
          <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textSecondary, marginTop: 2 }}>
            {item.payload.testCategory}
            {item.payload.labName ? ` \u2014 ${item.payload.labName}` : ''}
          </Text>
        ) : null}

        <Text style={{ fontSize: consumerTypography.captionSize, color: colors.textMuted, marginTop: 4 }}>
          {formatTimestamp(item.createdAt, t)}
        </Text>
      </View>
    </Pressable>
  )
}

// --- Main Screen ---

export function NotificationsScreen({
  navigation,
}: NotificationsStackScreenProps<'NotificationsScreen'>) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const {
    notifications,
    isLoading,
    fetchNotifications,
    startPolling,
    stopPolling,
    loadFromCache,
  } = useNotificationStore()

  const hapticFired = useRef(new Set<string>())
  const isFocused = useRef(false)

  // AC #7: Polling lifecycle — start on focus, stop on blur
  useFocusEffect(
    useCallback(() => {
      isFocused.current = true
      startPolling()
      return () => {
        isFocused.current = false
        stopPolling()
      }
    }, [startPolling, stopPolling]),
  )

  // AppState: pause polling when app goes to background (only if screen is focused)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (!isFocused.current) return
      if (nextState === 'active') {
        startPolling()
      } else {
        stopPolling()
      }
    })
    return () => sub.remove()
  }, [startPolling, stopPolling])

  // Load from cache on mount (for offline viewing) — only if store is empty
  useEffect(() => {
    const state = useNotificationStore.getState()
    if (state.notifications.length === 0 && state.lastFetched === null) {
      loadFromCache()
    }
  }, [loadFromCache])

  const handlePress = useCallback((item: NotificationItem) => {
    navigation.navigate('NotificationDetailScreen', { notificationId: item.id })
  }, [navigation])

  const renderItem = useCallback(({ item }: { item: NotificationItem }) => (
    <NotificationCard
      item={item}
      onPress={handlePress}
      hapticFired={hapticFired}
    />
  ), [handlePress])

  // AC #10: Empty state rendered via ListEmptyComponent so pull-to-refresh still works
  const emptyComponent = useCallback(() => (
    <View style={styles.emptyState}>
      {/* TODO: Replace emoji with a proper illustration asset per AC #10 */}
      <View style={[styles.emptyIllustration, { backgroundColor: colors.primary[50] }]}>
        <Text style={styles.emptyIcon}>{'\u{1F514}'}</Text>
      </View>
      <Text style={[styles.emptyText, { color: colors.textPrimary }]}>{t('notifications.emptyTitle')}</Text>
      <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>{t('notifications.emptySubtitle')}</Text>
    </View>
  ), [t, colors])

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="notifications-screen">
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={{ fontSize: consumerTypography.headerSize, fontWeight: consumerTypography.fontWeightHeader, color: colors.textPrimary }}>{t('notifications.title')}</Text>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={notifications.length === 0 ? styles.listContentEmpty : styles.listContent}
        // AC #9: Pull-to-refresh (works even when empty)
        onRefresh={fetchNotifications}
        refreshing={isLoading}
        testID="notification-list"
      />
    </View>
  )
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingVertical: consumerSpacing.md,
    borderBottomWidth: 1,
  },
  listContent: {
    paddingVertical: consumerSpacing.sm,
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: consumerSpacing.cardPadding,
    borderRadius: consumerBorderRadius.card,
    marginBottom: consumerSpacing.sm,
    borderWidth: 1,
  },
  cardElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardEscalation: {
    borderWidth: 2,
  },
  cardPressed: {
    opacity: 0.85,
  },

  // Icon
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    // backgroundColor applied inline via theme colors
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: consumerSpacing.md,
  },
  iconText: {
    fontSize: 20,
    writingDirection: 'ltr',
  },

  // Content
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },

  // Urgent badge
  urgentBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginStart: 8,
  },
  urgentBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: consumerSpacing.xl,
  },
  emptyIllustration: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: consumerSpacing.lg,
  },
  emptyIcon: {
    fontSize: 48,
    writingDirection: 'ltr',
  },
  emptyText: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    textAlign: 'center',
    marginBottom: consumerSpacing.sm,
  },
  emptySubtext: {
    fontSize: consumerTypography.bodySize,
    textAlign: 'center',
  },
})

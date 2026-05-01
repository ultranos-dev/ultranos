import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Modal,
} from 'react-native'
import {
  fetchNotifications,
  fetchUnreadCount,
  acknowledgeNotification,
  type NotificationItem,
} from '@/lib/notification-api'
import {
  consumerColors,
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'

const POLL_INTERVAL_MS = 30_000 // 30s polling for notification delivery

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString()
}

function notificationLabel(type: string): string {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE': return 'Lab Result Available'
    case 'LAB_RESULT_ESCALATION': return 'Lab Result — Urgent'
    case 'PRESCRIPTION_READY': return 'Prescription Ready'
    case 'CONSENT_CHANGE': return 'Consent Updated'
    default: return 'Notification'
  }
}

/**
 * Notification bell indicator for Patient Lite Mobile.
 * Story 12.4 AC 4: Patient notification appears in Patient Lite Mobile.
 */
export function NotificationIndicator() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const { count } = await fetchUnreadCount()
        if (active) setUnreadCount(count)
      } catch {
        // Offline-tolerant: silently handle network errors
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  return (
    <>
      <Pressable
        onPress={() => setIsOpen(true)}
        style={styles.bellButton}
        accessibilityLabel={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        accessibilityRole="button"
      >
        <Text style={styles.bellIcon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </Pressable>

      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsOpen(false)}
      >
        <NotificationList
          onClose={() => setIsOpen(false)}
          onCountChange={setUnreadCount}
        />
      </Modal>
    </>
  )
}

function NotificationList({
  onClose,
  onCountChange,
}: {
  onClose: () => void
  onCountChange: (count: number) => void
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const { notifications: items } = await fetchNotifications()
        if (active) {
          setNotifications(items)
          onCountChange(items.filter(n => n.status !== 'ACKNOWLEDGED').length)
        }
      } catch {
        // Offline-tolerant
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onCountChange is a stable setState reference
  }, [])

  const handleAcknowledge = useCallback(async (id: string) => {
    try {
      await acknowledgeNotification(id)
      setNotifications(prev => {
        const updated = prev.map(n =>
          n.id === id
            ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() }
            : n,
        )
        onCountChange(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
        return updated
      })
    } catch {
      // Best-effort acknowledge
    }
  }, [onCountChange])

  const renderItem = useCallback(({ item }: { item: NotificationItem }) => {
    const isUnread = item.status !== 'ACKNOWLEDGED'
    const isEscalation = item.type === 'LAB_RESULT_ESCALATION'

    return (
      <View style={[
        styles.notificationCard,
        isUnread && styles.notificationUnread,
        isEscalation && styles.notificationUrgent,
      ]}>
        <View style={styles.notificationContent}>
          <Text style={[
            styles.notificationTitle,
            isEscalation && styles.urgentText,
          ]}>
            {notificationLabel(item.type)}
          </Text>
          {item.payload.testCategory && (
            <Text style={styles.notificationDetail}>
              {item.payload.testCategory}
              {item.payload.labName ? ` — ${item.payload.labName}` : ''}
            </Text>
          )}
          <Text style={styles.notificationTime}>
            {formatTimestamp(item.createdAt)}
          </Text>
        </View>

        {isUnread && (
          <Pressable
            onPress={() => handleAcknowledge(item.id)}
            style={styles.viewButton}
            accessibilityLabel="Mark as read"
          >
            <Text style={styles.viewButtonText}>View</Text>
          </Pressable>
        )}
      </View>
    )
  }, [handleAcknowledge])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable onPress={onClose} accessibilityLabel="Close">
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Loading...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No notifications</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bellButton: {
    position: 'relative',
    padding: consumerSpacing.sm,
  },
  bellIcon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: 0,
    end: 0,
    backgroundColor: consumerColors.error,
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
  container: {
    flex: 1,
    backgroundColor: consumerColors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingVertical: consumerSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: consumerColors.border,
  },
  headerTitle: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    color: consumerColors.textPrimary,
  },
  closeButton: {
    fontSize: 20,
    color: consumerColors.textSecondary,
    padding: consumerSpacing.sm,
  },
  listContent: {
    paddingVertical: consumerSpacing.sm,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
    paddingVertical: consumerSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: consumerColors.border,
  },
  notificationUnread: {
    backgroundColor: consumerColors.surfaceElevated,
  },
  notificationUrgent: {
    borderStartWidth: 4,
    borderStartColor: consumerColors.error,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.textPrimary,
  },
  urgentText: {
    color: consumerColors.error,
  },
  notificationDetail: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textSecondary,
    marginTop: 2,
  },
  notificationTime: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textTertiary,
    marginTop: 4,
  },
  viewButton: {
    backgroundColor: consumerColors.primary,
    paddingHorizontal: consumerSpacing.md,
    paddingVertical: consumerSpacing.sm,
    borderRadius: consumerBorderRadius.button,
  },
  viewButtonText: {
    color: '#FFFFFF',
    fontSize: consumerTypography.captionSize,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: consumerSpacing.xl,
  },
  emptyText: {
    fontSize: consumerTypography.bodySize,
    color: consumerColors.textTertiary,
  },
})

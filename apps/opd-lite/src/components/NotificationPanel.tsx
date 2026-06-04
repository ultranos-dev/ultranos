'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import {
  fetchNotifications,
  fetchUnreadCount,
  acknowledgeNotification,
  type NotificationItem,
} from '@/lib/notification-api'

const POLL_INTERVAL_MS = 30_000 // 30s polling for <60s SLA (AC: 3)

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
    case 'SYNC_CONFLICT': return 'Sync Conflict'
    case 'ALLERGY_UPDATE': return 'Allergy Update'
    default: return 'Notification'
  }
}

/**
 * Notification bell icon with unread count badge.
 * Toggles the notification panel on click.
 */
export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const { count } = await fetchUnreadCount()
        if (active) setUnreadCount(count)
      } catch {
        // Silently handle — network may be unavailable (offline-first)
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
    <div className="relative">
      <Button
        variant="icon"
        type="button"
        className="relative p-2"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-6 w-6" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <NotificationDropdown
          onClose={() => setIsOpen(false)}
          onCountChange={setUnreadCount}
        />
      )}
    </div>
  )
}

/**
 * Notification dropdown panel.
 * Displays notifications with "View Report" action.
 * Marks as acknowledged on view (AC: 3).
 */
function NotificationDropdown({
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
          const unread = items.filter(n => n.status !== 'ACKNOWLEDGED').length
          onCountChange(unread)
        }
      } catch {
        // Offline-tolerant: show empty state
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const handleAcknowledge = useCallback(async (id: string) => {
    try {
      await acknowledgeNotification(id)
      setNotifications(prev => {
        const updated = prev.map(n => n.id === id ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() } : n)
        onCountChange(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
        return updated
      })
    } catch {
      // Best-effort acknowledge
    }
  }, [onCountChange])

  return (
    <div className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl bg-background/70 backdrop-blur-md ring-[0.65px] ring-gray-400/40 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
        <Button
          variant="icon"
          type="button"
          onClick={onClose}
          aria-label="Close notifications"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        )}

        {!loading && notifications.map(n => (
          <NotificationRow
            key={n.id}
            notification={n}
            onAcknowledge={handleAcknowledge}
          />
        ))}
      </div>
    </div>
  )
}

function NotificationRow({
  notification,
  onAcknowledge,
}: {
  notification: NotificationItem
  onAcknowledge: (id: string) => void
}) {
  const isUnread = notification.status !== 'ACKNOWLEDGED'
  const isEscalation = notification.type === 'LAB_RESULT_ESCALATION'

  return (
    <div
      className={`border-b border-neutral-100 px-4 py-3 ${isUnread ? 'bg-primary/10' : ''} ${isEscalation ? 'border-s-4 border-s-red-500' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isEscalation ? 'text-destructive' : 'text-foreground'}`}>
            {notificationLabel(notification.type)}
          </p>
          {notification.payload.testCategory && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {notification.payload.testCategory}
              {notification.payload.labName && ` — ${notification.payload.labName}`}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTimestamp(notification.createdAt)}
          </p>
        </div>

        {isUnread && notification.payload.diagnosticReportId && (
          <Button
            variant="primary"
            className="shrink-0"
            type="button"
            onClick={() => onAcknowledge(notification.id)}
          >
            View Report
          </Button>
        )}
      </div>
    </div>
  )
}

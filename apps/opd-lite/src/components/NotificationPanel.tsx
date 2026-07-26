'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@ultranos/ui-kit'
import { Bell, X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import {
  fetchNotifications,
  fetchUnreadCount,
  acknowledgeNotification,
  type NotificationItem,
} from '@/lib/notification-api'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { notificationLabelKey } from '@/lib/notification-label'

const POLL_INTERVAL_MS = 30_000 // 30s polling for <60s SLA (AC: 3)

function formatTimestamp(
  iso: string,
  locale: 'en' | 'ar' | 'prs' | 'ps',
  tTime: ReturnType<typeof useTranslations<'time'>>,
): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return tTime('justNow')
  if (diffMin < 60) return tTime('minutesAgo', { minutes: diffMin })
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return tTime('hoursAgo', { hours: diffHrs })
  return formatDate(d, locale)
}

// notificationLabel is now provided via the shared notificationLabelKey helper + useTranslations('notifications')

/**
 * Notification bell icon with unread count badge.
 * Toggles the notification panel on click.
 */
export function NotificationBell() {
  const tNotif = useTranslations('notifications')
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
        aria-label={
          unreadCount > 0
            ? tNotif('bellUnreadAria', { count: unreadCount })
            : tNotif('bellAria')
        }
      >
        <Bell className="h-6 w-6" />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
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
  const tNotif = useTranslations('notifications')
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
    <div className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl bg-background ring-[0.65px] ring-border/50 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{tNotif('title')}</h3>
        <Button
          variant="icon"
          type="button"
          onClick={onClose}
          aria-label={tNotif('closeAria')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {tNotif('loading')}
          </div>
        )}

        {!loading && notifications.length === 0 && (
          <EmptyState title={tNotif('empty')} size="sm" />
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
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const tNotif = useTranslations('notifications')
  const tTime = useTranslations('time')
  const isUnread = notification.status !== 'ACKNOWLEDGED'
  const isEscalation = notification.type === 'LAB_RESULT_ESCALATION'

  return (
    <div
      className={`border-b border-border px-4 py-3 ${isUnread ? 'bg-primary/10' : ''} ${isEscalation ? 'ring-1 ring-inset ring-destructive/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${isEscalation ? 'text-destructive' : 'text-foreground'}`}>
            {tNotif(notificationLabelKey(notification.type))}
          </p>
          {notification.payload.testCategory && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {notification.payload.testCategory}
              {notification.payload.labName && ` · ${notification.payload.labName}`}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {formatTimestamp(notification.createdAt, locale, tTime)}
          </p>
        </div>

        {isUnread && notification.payload.diagnosticReportId && (
          <Button
            variant="primary"
            className="shrink-0"
            type="button"
            onClick={() => onAcknowledge(notification.id)}
          >
            {tNotif('viewReport')}
          </Button>
        )}
      </div>
    </div>
  )
}

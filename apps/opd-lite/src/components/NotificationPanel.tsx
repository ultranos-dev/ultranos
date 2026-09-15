'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate, formatDateTime } from '@ultranos/ui-kit'
import { Bell, X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import {
  fetchNotifications,
  fetchUnreadCount,
  acknowledgeNotification,
  deleteNotification,
  markUnreadNotification,
  type NotificationItem,
} from '@/lib/notification-api'
import type { NotificationDetailField } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { NotificationRow } from '@ultranos/ui-kit/components/ui/notification-row'
import { NotificationDetailModal } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '@ultranos/ui-kit/notification-presentation'
import { useNotificationPatient } from '@/hooks/useNotificationPatient'

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
 * Rows use the shared ui-kit NotificationRow with descriptor-field resolver.
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
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()

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
  }, [onCountChange])

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

  const handleMarkUnread = useCallback(async (id: string) => {
    // Optimistic update — flip back to unread immediately
    setNotifications(prev => {
      const updated = prev.map(n =>
        n.id === id ? { ...n, status: 'SENT', acknowledgedAt: null } : n,
      )
      onCountChange(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
      return updated
    })

    try {
      await markUnreadNotification(id)
    } catch {
      // Best-effort mark-unread
    }
  }, [onCountChange])

  const handleDelete = useCallback(async (id: string) => {
    // Optimistic removal
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id)
      onCountChange(updated.filter(n => n.status !== 'ACKNOWLEDGED').length)
      return updated
    })

    try {
      await deleteNotification(id)
    } catch {
      // Best-effort delete
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
          <PanelNotificationRow
            key={n.id}
            notification={n}
            openId={openId}
            setOpenId={setOpenId}
            onAcknowledge={handleAcknowledge}
            onMarkUnread={handleMarkUnread}
            onDelete={handleDelete}
            onNavigate={(path) => { router.push(path); onClose() }}
            tNotif={tNotif}
          />
        ))}
      </div>
    </div>
  )
}

function PanelNotificationRow({
  notification: n,
  openId,
  setOpenId,
  onAcknowledge,
  onMarkUnread,
  onDelete,
  onNavigate,
  tNotif,
}: {
  notification: NotificationItem
  openId: string | null
  setOpenId: (id: string | null) => void
  onAcknowledge: (id: string) => void
  onMarkUnread: (id: string) => void
  onDelete: (id: string) => void
  onNavigate: (path: string) => void
  tNotif: ReturnType<typeof useTranslations<'notifications'>>
}) {
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const tTime = useTranslations('time')
  const app = n.sourceApp ?? deriveSourceApp(n.type)
  const appName = tNotif(sourceAppNameKey(app) as Parameters<typeof tNotif>[0])
  const subject = tNotif(
    (`subject.${n.subjectKey ?? n.type}`) as Parameters<typeof tNotif>[0],
  )
  const body = n.bodyKey
    ? tNotif(
        (`body.${n.bodyKey}`) as Parameters<typeof tNotif>[0],
        n.bodyParams ?? {},
      )
    : undefined
  const notes = n.notesKey
    ? tNotif((`notes.${n.notesKey}`) as Parameters<typeof tNotif>[0])
    : undefined
  const Icon = sourceAppIcon(app)
  const timeAgo = formatTimestamp(n.createdAt, locale, tTime)
  const isOpen = openId === n.id

  // Deep link for panel: only a few types have deep routes
  const deepLink = n.payload?.diagnosticReportId
    ? `/patient/${n.payload.diagnosticReportId}#lab-results`
    : n.type === 'SYNC_CONFLICT'
    ? '/conflicts'
    : null

  // Patient lookup — only resolves when modal is open
  const { name: patientName, loading: patientLoading } = useNotificationPatient(
    isOpen ? n : null,
  )

  // Build detail rows from non-PHI notification fields
  const details: NotificationDetailField[] = []

  const orderId = n.payload?.orderId
  if (orderId) {
    const shortId = orderId.slice(-6).toUpperCase()
    details.push({
      label: tNotif('field.orderId' as Parameters<typeof tNotif>[0]),
      value: `${orderId} (${shortId})`,
    })
  }
  const diagnosticReportId = n.payload?.diagnosticReportId
  if (diagnosticReportId && !orderId) {
    const shortId = diagnosticReportId.slice(-6).toUpperCase()
    details.push({
      label: tNotif('field.referenceId' as Parameters<typeof tNotif>[0]),
      value: `${diagnosticReportId} (${shortId})`,
    })
  }
  const prescriptionId = n.payload?.prescriptionId
  if (prescriptionId) {
    const shortId = prescriptionId.slice(-6).toUpperCase()
    details.push({
      label: tNotif('field.referenceId' as Parameters<typeof tNotif>[0]),
      value: `${prescriptionId} (${shortId})`,
    })
  }

  const testCategory = n.payload?.testCategory ?? (n.bodyParams as Record<string, string> | undefined)?.testCategory
  if (testCategory) {
    details.push({
      label: tNotif('field.test' as Parameters<typeof tNotif>[0]),
      value: String(testCategory),
    })
  }

  const labName = n.payload?.labName ?? (n.bodyParams as Record<string, string> | undefined)?.labName
  if (labName) {
    details.push({
      label: tNotif('field.lab' as Parameters<typeof tNotif>[0]),
      value: String(labName),
    })
  }

  const statusValue = n.payload?.status
  if (statusValue) {
    details.push({
      label: tNotif('field.status' as Parameters<typeof tNotif>[0]),
      value: statusValue,
    })
  }

  const receivedTs = n.payload?.acknowledgedAt ?? n.createdAt
  if (receivedTs) {
    details.push({
      label: tNotif('field.received' as Parameters<typeof tNotif>[0]),
      value: formatDateTime(new Date(receivedTs), locale),
    })
  }

  return (
    <>
      <NotificationRow
        icon={Icon}
        appName={appName}
        subject={subject}
        body={body}
        notes={notes}
        timeAgo={timeAgo}
        unread={n.status !== 'ACKNOWLEDGED'}
        urgent={n.type === 'LAB_RESULT_ESCALATION'}
        unreadLabel={tNotif('unread' as Parameters<typeof tNotif>[0])}
        onClick={() => {
          setOpenId(n.id)
          onAcknowledge(n.id)
        }}
        onToggleRead={() => {
          n.status !== 'ACKNOWLEDGED' ? onAcknowledge(n.id) : onMarkUnread(n.id)
        }}
        onDelete={() => onDelete(n.id)}
        markReadLabel={tNotif('markRead' as Parameters<typeof tNotif>[0])}
        markUnreadLabel={tNotif('markUnread' as Parameters<typeof tNotif>[0])}
        deleteLabel={tNotif('delete' as Parameters<typeof tNotif>[0])}
      />
      <NotificationDetailModal
        open={isOpen}
        onOpenChange={(o) => { if (!o) setOpenId(null) }}
        icon={Icon}
        appName={appName}
        subject={subject}
        body={body}
        notes={notes}
        exactTimestamp={formatDate(new Date(n.createdAt), locale)}
        details={details.length > 0 ? details : undefined}
        patient={patientName
          ? { label: tNotif('field.patient' as Parameters<typeof tNotif>[0]), value: patientName }
          : null
        }
        patientLoading={patientLoading}
        action={deepLink
          ? {
              label: tNotif('viewDetails' as Parameters<typeof tNotif>[0]),
              onClick: () => onNavigate(deepLink),
            }
          : undefined
        }
      />
    </>
  )
}

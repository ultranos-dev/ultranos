'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate, formatDateTime } from '@ultranos/ui-kit'
import {
  fetchNotifications,
  acknowledgeNotification,
  deleteNotification,
  markUnreadNotification,
  type NotificationItem,
} from '@/lib/notification-api'
import type { NotificationDetailField } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { NotificationBell as SharedNotificationBell } from '@ultranos/ui-kit/components/notifications/notification-bell'
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
 * OPD-Lite notification bell — adapts OPD's notification data to the SHARED
 * ui-kit NotificationBell shell (badge + dropdown + "See all"). Rows are still
 * OPD-specific (PanelNotificationRow carries OPD's payload mapping, deep links,
 * and patient enrichment); the shell owns the chrome so the bell is identical
 * across all apps.
 */
export function NotificationBell() {
  const tNotif = useTranslations('notifications')
  const router = useRouter()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { notifications: items } = await fetchNotifications()
      setNotifications(items)
      setError(false)
    } catch {
      setError(true) // never a false "no notifications"
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const run = () => { if (active) void load() }
    run()
    const interval = setInterval(run, POLL_INTERVAL_MS)
    return () => { active = false; clearInterval(interval) }
  }, [load])

  const unreadCount = notifications.filter(n => n.status !== 'ACKNOWLEDGED').length

  const handleAcknowledge = useCallback(async (id: string) => {
    try {
      await acknowledgeNotification(id)
      setNotifications(prev => prev.map(n =>
        n.id === id ? { ...n, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString() } : n,
      ))
    } catch {
      // Best-effort acknowledge
    }
  }, [])

  const handleMarkUnread = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, status: 'SENT', acknowledgedAt: null } : n,
    ))
    try {
      await markUnreadNotification(id)
    } catch {
      // Best-effort mark-unread
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    try {
      await deleteNotification(id)
    } catch {
      // Best-effort delete
    }
  }, [])

  return (
    <SharedNotificationBell
      unreadCount={unreadCount}
      loading={loading}
      error={error}
      empty={!loading && !error && notifications.length === 0}
      onSeeAll={() => router.push('/notifications')}
    >
      {notifications.map(n => (
        <PanelNotificationRow
          key={n.id}
          notification={n}
          openId={openId}
          setOpenId={setOpenId}
          onAcknowledge={handleAcknowledge}
          onMarkUnread={handleMarkUnread}
          onDelete={handleDelete}
          onNavigate={(path) => { router.push(path) }}
          tNotif={tNotif}
        />
      ))}
    </SharedNotificationBell>
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

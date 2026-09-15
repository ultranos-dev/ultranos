'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate, formatDateTime } from '@ultranos/ui-kit'
import { NotificationRow } from '@ultranos/ui-kit/components/ui/notification-row'
import { NotificationDetailModal } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import type { NotificationDetailField } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '@ultranos/ui-kit/notification-presentation'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { X } from '@ultranos/ui-kit/icons'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import { deleteNotification, markUnreadNotification } from '@/lib/trpc'
import type { NotificationItem } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'

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
 * Notification dropdown panel anchored below the bell icon.
 * Polls via useNotificationPoll, supports click-outside and Escape to dismiss.
 * Enriched rows: source-app icon + app-name + subject + body + notes + timestamp.
 * Task 11 — notification presentation enrichment.
 */
export function NotificationPanel({
  onClose,
  onCountChange,
}: {
  onClose: () => void
  onCountChange: (count: number) => void
}) {
  const tNotif = useTranslations('notifications')
  const [openId, setOpenId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const { notifications: polledNotifications, loading, error, acknowledge } = useNotificationPoll()

  // Local deleted-IDs set so rows vanish immediately without waiting for next poll.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  // Local status overrides: maps notificationId → partial override (for mark-unread flip).
  const [statusOverrides, setStatusOverrides] = useState<Map<string, Partial<NotificationItem>>>(new Map())

  const notifications = useMemo(
    () => polledNotifications
      .filter(n => !deletedIds.has(n.id))
      .map(n => {
        const override = statusOverrides.get(n.id)
        return override ? { ...n, ...override } : n
      }),
    [polledNotifications, deletedIds, statusOverrides],
  )

  // Recompute unread from the filtered list and keep parent badge in sync.
  const filteredUnread = useMemo(
    () => notifications.filter(n => n.status !== 'ACKNOWLEDGED').length,
    [notifications],
  )
  useEffect(() => {
    onCountChange(filteredUnread)
  }, [filteredUnread, onCountChange])

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      return data.session?.access_token ?? null
    } catch {
      return null
    }
  }, [])

  const handleAcknowledge = useCallback(async (id: string) => {
    // Clear any unread override so the acknowledged state from the poll takes precedence.
    setStatusOverrides(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    await acknowledge(id)
  }, [acknowledge])

  const handleMarkUnread = useCallback(async (id: string) => {
    // Optimistic: flip the item back to unread immediately.
    setStatusOverrides(prev => {
      const next = new Map(prev)
      next.set(id, { status: 'SENT', acknowledgedAt: null })
      return next
    })
    try {
      const token = await getToken()
      if (!token) return
      await markUnreadNotification(id, token)
    } catch {
      // Best-effort mark-unread — optimistic update stays
    }
  }, [getToken])

  const handleDelete = useCallback(async (id: string) => {
    // Optimistic removal — row disappears immediately.
    setDeletedIds(prev => new Set([...prev, id]))
    setStatusOverrides(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    try {
      const token = await getToken()
      if (!token) return
      await deleteNotification(id, token)
    } catch {
      // Best-effort delete — row stays removed from local list regardless.
    }
  }, [getToken])

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        const bell = panelRef.current.closest('.relative')
        if (bell && bell.contains(e.target as Node)) return
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <>
      <style>{`
  @keyframes notifBackdropIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes notifPanelIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
`}</style>
      <div className="fixed inset-0 z-40 animate-[notifBackdropIn_100ms_ease-out_forwards]" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={tNotif('title')}
        className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl bg-popover shadow-lg ring-[0.65px] ring-border/50 animate-[notifPanelIn_150ms_ease-out_forwards] [transform-origin:top_right]"
        data-testid="notification-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h3 className="text-sm font-semibold text-foreground">{tNotif('title')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={tNotif('closeAria' as Parameters<typeof tNotif>[0])}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {error ? (
            <p data-testid="notification-error" className="px-4 py-6 text-center text-sm text-destructive">
              {tNotif('error' as Parameters<typeof tNotif>[0])}
            </p>
          ) : loading ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{tNotif('loading')}</p>
          ) : notifications.length === 0 ? (
            <EmptyState title={tNotif('empty')} size="sm" />
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
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
          )}
        </div>
      </div>
    </>
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

  // Deep link for lab-specific notification types
  const deepLink = n.type === 'SYNC_CONFLICT' ? '/sync' : null

  // Build NON-PHI detail rows for the modal — no patient fields, ever
  const details: NotificationDetailField[] = []
  const bp = n.bodyParams as Record<string, string | number> | null | undefined

  // Pathogen — outbreak notifications only
  const pathogen = bp?.pathogen
  if (pathogen) {
    details.push({
      label: tNotif('field.pathogen' as Parameters<typeof tNotif>[0]),
      value: String(pathogen),
    })
  }

  // Status — operational field (e.g. APPROVED / SUSPENDED)
  const statusValue = (bp?.status ?? n.payload?.status)
  if (statusValue) {
    details.push({
      label: tNotif('field.status' as Parameters<typeof tNotif>[0]),
      value: String(statusValue),
    })
  }

  // Reference — non-PHI id if present (orderId from bodyParams, or outbreak ref)
  const referenceId = bp?.orderId ?? bp?.outbreakId
  if (referenceId) {
    details.push({
      label: tNotif('field.referenceId' as Parameters<typeof tNotif>[0]),
      value: String(referenceId),
    })
  }

  // Received — always present: acknowledgedAt if available, else createdAt
  const receivedTs = n.payload?.acknowledgedAt ?? n.createdAt
  details.push({
    label: tNotif('field.received' as Parameters<typeof tNotif>[0]),
    value: formatDateTime(new Date(receivedTs), locale),
  })

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
        urgent={false}
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

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@ultranos/ui-kit'
import { NotificationRow } from '@ultranos/ui-kit/components/ui/notification-row'
import { NotificationDetailModal } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '@ultranos/ui-kit/notification-presentation'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { X } from '@ultranos/ui-kit/icons'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import type { NotificationItem } from '@/lib/trpc'

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

  const { notifications, loading, error, acknowledge, unreadCount } = useNotificationPoll()

  // Keep parent badge in sync with the poll hook's unread count
  useEffect(() => {
    onCountChange(unreadCount)
  }, [unreadCount, onCountChange])

  const handleAcknowledge = useCallback(async (id: string) => {
    await acknowledge(id)
  }, [acknowledge])

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
        className="absolute end-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl bg-popover shadow-lg ring-[0.65px] ring-border/50 animate-[notifPanelIn_150ms_ease-out_forwards] [transform-origin:top_right]"
        data-testid="notification-panel"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-sm font-semibold text-foreground">{tNotif('title')}</span>
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
  onNavigate,
  tNotif,
}: {
  notification: NotificationItem
  openId: string | null
  setOpenId: (id: string | null) => void
  onAcknowledge: (id: string) => void
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
      />
      <NotificationDetailModal
        open={isOpen}
        onOpenChange={(o) => { if (!o) setOpenId(null) }}
        icon={Icon}
        appName={appName}
        subject={subject}
        body={body}
        notes={notes}
        exactTimestamp={n.createdAt}
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

'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate, formatDateTime } from '@ultranos/ui-kit'
import { NotificationRow } from '@ultranos/ui-kit/components/ui/notification-row'
import { NotificationDetailModal } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import type { NotificationDetailField } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '@ultranos/ui-kit/notification-presentation'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import type { AdminNotificationItem } from '@/lib/notification-client'

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

export function NotificationPanel({
  onClose,
  onChange,
}: {
  onClose: () => void
  onChange: () => void
}) {
  const tNotif = useTranslations('notifications')
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()

  const { notifications, loading, error, acknowledge } = useNotificationPoll()

  const handleAcknowledge = useCallback(async (id: string) => {
    await acknowledge(id)
    onChange()
  }, [acknowledge, onChange])

  return (
    <div
      data-testid="notification-panel"
      className="absolute end-0 top-11 z-50 w-80 overflow-hidden rounded-xl bg-popover shadow-lg ring-[0.65px] ring-border/50"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-semibold text-foreground">{tNotif('title')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={tNotif('closeAria')}
          className="text-lg leading-none text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {error ? (
          <p data-testid="notification-error" className="px-4 py-6 text-center text-sm text-destructive">
            {tNotif('error')}
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
  notification: AdminNotificationItem
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

  // Build NON-PHI detail rows for the modal.
  // Admin notifications are operational/governance — no patient lookup.
  const details: NotificationDetailField[] = []

  const referenceId = n.payload?.referenceId
  if (referenceId) {
    const shortId = String(referenceId).slice(-8).toUpperCase()
    details.push({
      label: tNotif('field.referenceId' as Parameters<typeof tNotif>[0]),
      value: shortId,
    })
  }

  const statusValue = (n.bodyParams as Record<string, string> | undefined)?.status ?? n.payload?.status
  if (statusValue) {
    details.push({
      label: tNotif('field.status' as Parameters<typeof tNotif>[0]),
      value: String(statusValue),
    })
  }

  const receivedTs = n.payload?.acknowledgedAt ?? n.createdAt
  if (receivedTs) {
    details.push({
      label: tNotif('field.received' as Parameters<typeof tNotif>[0]),
      value: formatDateTime(new Date(String(receivedTs)), locale),
    })
  }

  // Deep link for relevant admin types
  const deepLink: string | null =
    n.type === 'KYC_APPROVED' || n.type === 'KYC_REJECTED' || n.type === 'KYC_MORE_INFO_REQUESTED'
      ? '/providers'
      : n.type === 'LAB_APPROVED' || n.type === 'LAB_SUSPENDED' || n.type === 'LAB_REACTIVATED'
        ? '/labs'
        : n.type === 'PROVIDER_SUSPENDED'
          ? '/providers'
          : n.type === 'OUTBREAK_MODE_ACTIVATED' || n.type === 'OUTBREAK_MODE_DEACTIVATED'
            ? '/network'
            : null

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

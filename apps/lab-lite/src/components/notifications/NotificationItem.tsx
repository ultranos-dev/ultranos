'use client'

import { useTranslations } from 'next-intl'
import type { NotificationItem as NotificationItemType } from '@/lib/trpc'
import { Check, AlertTriangle, ShieldCheck, Settings } from '@ultranos/ui-kit/icons'

/**
 * Maps Hub API notification types to Lab Lite display configuration.
 * Story 17.4 — Task 4 (AC #2, #3, #4)
 */

interface NotificationDisplay {
  labelKey: string
  iconColor: string
  icon: React.ReactNode
}

function getNotificationDisplay(type: string): NotificationDisplay {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE':
      return {
        labelKey: 'resultUploaded',
        iconColor: 'text-green-600',
        icon: <Check size={20} className="h-5 w-5" aria-hidden="true" />,
      }
    case 'LAB_RESULT_ESCALATION':
      return {
        labelKey: 'resultAwaitingReview',
        iconColor: 'text-yellow-600',
        icon: <AlertTriangle size={20} className="h-5 w-5" aria-hidden="true" />,
      }
    case 'LAB_STATUS_CHANGE':
    case 'LAB_STATUS_APPROVED':
    case 'LAB_STATUS_SUSPENDED':
      return {
        labelKey: 'labStatusChanged',
        iconColor: 'text-blue-600',
        icon: <ShieldCheck size={20} className="h-5 w-5" aria-hidden="true" />,
      }
    default:
      // SYSTEM_MAINTENANCE and any other types
      return {
        labelKey: 'systemNotice',
        iconColor: 'text-muted-foreground',
        icon: <Settings size={20} className="h-5 w-5" aria-hidden="true" />,
      }
  }
}

export function NotificationItemRow({
  notification,
  onAcknowledge,
}: {
  notification: NotificationItemType
  onAcknowledge: (id: string) => void
}) {
  const t = useTranslations('notifications')
  const tTime = useTranslations('time')
  const isUnread = notification.status !== 'ACKNOWLEDGED'
  const display = getNotificationDisplay(notification.type)

  function formatMessage(type: string, payload: NotificationItemType['payload']): string {
    const unknownTest = t('unknownTest')
    switch (type) {
      case 'LAB_RESULT_AVAILABLE':
        return t('resultUploadedMessage', { testCategory: payload.testCategory ?? unknownTest })
      case 'LAB_RESULT_ESCALATION':
        return t('resultEscalationMessage', { testCategory: payload.testCategory ?? unknownTest })
      case 'LAB_STATUS_CHANGE':
      case 'LAB_STATUS_APPROVED':
      case 'LAB_STATUS_SUSPENDED':
        return t('labStatusMessage', { status: payload.message ?? type.split('_').pop()?.toLowerCase() ?? 'changed' })
      default:
        return payload.message ?? t('systemNotification')
    }
  }

  function formatTimestamp(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60_000)
    if (diffMin < 1) return tTime('justNow')
    if (diffMin < 60) return tTime('minutesAgo', { minutes: diffMin })
    const diffHrs = Math.floor(diffMin / 60)
    if (diffHrs < 24) return tTime('hoursAgo', { hours: diffHrs })
    return d.toLocaleDateString()
  }

  const message = formatMessage(notification.type, notification.payload)

  return (
    <button
      type="button"
      onClick={() => {
        if (isUnread) onAcknowledge(notification.id)
      }}
      className={`flex w-full items-start gap-3 border-b border-border/50 px-4 py-3 text-start transition-colors hover:bg-muted/30 ${
        isUnread ? 'bg-blue-50' : ''
      }`}
      data-testid="notification-item"
      aria-label={isUnread ? t('unreadMessage', { message }) : message}
    >
      {/* Type-specific icon */}
      <span className={`mt-0.5 shrink-0 ${display.iconColor}`} aria-hidden="true">
        {display.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isUnread ? 'font-semibold text-foreground' : 'font-normal text-foreground'}`}>
          {message}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatTimestamp(notification.createdAt)}
        </p>
      </div>

      {/* Unread dot indicator */}
      {isUnread && (
        <span
          className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500"
          aria-label={t('unreadAriaLabel')}
          data-testid="unread-dot"
        />
      )}
    </button>
  )
}

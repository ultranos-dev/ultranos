'use client'

import type { NotificationItem as NotificationItemType } from '@/lib/trpc'
import { Check, AlertTriangle, ShieldCheck, Settings } from '@ultranos/ui-kit/icons'

/**
 * Maps Hub API notification types to Lab Lite display configuration.
 * Story 17.4 — Task 4 (AC #2, #3, #4)
 */

interface NotificationDisplay {
  label: string
  iconColor: string
  icon: React.ReactNode
}

function getNotificationDisplay(type: string): NotificationDisplay {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE':
      return {
        label: 'Result uploaded',
        iconColor: 'text-green-600',
        icon: <Check size={20} className="h-5 w-5" aria-hidden="true" />,
      }
    case 'LAB_RESULT_ESCALATION':
      return {
        label: 'Result awaiting review',
        iconColor: 'text-yellow-600',
        icon: <AlertTriangle size={20} className="h-5 w-5" aria-hidden="true" />,
      }
    case 'LAB_STATUS_CHANGE':
    case 'LAB_STATUS_APPROVED':
    case 'LAB_STATUS_SUSPENDED':
      return {
        label: 'Lab status changed',
        iconColor: 'text-blue-600',
        icon: <ShieldCheck size={20} className="h-5 w-5" aria-hidden="true" />,
      }
    default:
      // SYSTEM_MAINTENANCE and any other types
      return {
        label: 'System notice',
        iconColor: 'text-neutral-600',
        icon: <Settings size={20} className="h-5 w-5" aria-hidden="true" />,
      }
  }
}

function formatMessage(type: string, payload: NotificationItemType['payload']): string {
  switch (type) {
    case 'LAB_RESULT_AVAILABLE':
      return `Result uploaded — ${payload.testCategory ?? 'Unknown test'}`
    case 'LAB_RESULT_ESCALATION':
      return `Result awaiting review — ${payload.testCategory ?? 'Unknown test'}`
    case 'LAB_STATUS_CHANGE':
    case 'LAB_STATUS_APPROVED':
    case 'LAB_STATUS_SUSPENDED':
      return `Lab status: ${payload.message ?? type.split('_').pop()?.toLowerCase() ?? 'changed'}`
    default:
      return payload.message ?? 'System notification'
  }
}

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

export function NotificationItemRow({
  notification,
  onAcknowledge,
}: {
  notification: NotificationItemType
  onAcknowledge: (id: string) => void
}) {
  const isUnread = notification.status !== 'ACKNOWLEDGED'
  const display = getNotificationDisplay(notification.type)
  const message = formatMessage(notification.type, notification.payload)

  return (
    <button
      type="button"
      onClick={() => {
        if (isUnread) onAcknowledge(notification.id)
      }}
      className={`flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-3 text-start transition-colors hover:bg-neutral-50 ${
        isUnread ? 'bg-blue-50' : ''
      }`}
      data-testid="notification-item"
      aria-label={`${isUnread ? 'Unread: ' : ''}${message}`}
    >
      {/* Type-specific icon */}
      <span className={`mt-0.5 shrink-0 ${display.iconColor}`} aria-hidden="true">
        {display.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isUnread ? 'font-semibold text-neutral-900' : 'font-normal text-neutral-700'}`}>
          {message}
        </p>
        <p className="mt-0.5 text-xs text-neutral-400">
          {formatTimestamp(notification.createdAt)}
        </p>
      </div>

      {/* Unread dot indicator */}
      {isUnread && (
        <span
          className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500"
          aria-label="Unread"
          data-testid="unread-dot"
        />
      )}
    </button>
  )
}

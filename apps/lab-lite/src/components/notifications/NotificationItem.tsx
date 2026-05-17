'use client'

import type { NotificationItem as NotificationItemType } from '@/lib/trpc'

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
        // Green check icon
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        ),
      }
    case 'LAB_RESULT_ESCALATION':
      return {
        label: 'Result awaiting review',
        iconColor: 'text-yellow-600',
        // Warning icon
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        ),
      }
    case 'LAB_STATUS_CHANGE':
    case 'LAB_STATUS_APPROVED':
    case 'LAB_STATUS_SUSPENDED':
      return {
        label: 'Lab status changed',
        iconColor: 'text-blue-600',
        // Shield icon
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
        ),
      }
    default:
      // SYSTEM_MAINTENANCE and any other types — wrench icon
      return {
        label: 'System notice',
        iconColor: 'text-neutral-600',
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
          </svg>
        ),
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

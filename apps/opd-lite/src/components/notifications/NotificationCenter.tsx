'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import type { NotificationItem } from '@/lib/notification-api'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

// --- Type grouping for tab filters ---

const LAB_TYPES = ['LAB_RESULT_AVAILABLE', 'LAB_RESULT_ESCALATION'] as const
const RX_TYPES = ['PRESCRIPTION_READY'] as const
const SYSTEM_TYPES = ['SYNC_CONFLICT', 'CONSENT_CHANGE', 'ALLERGY_UPDATE'] as const

type TabKey = 'all' | 'lab' | 'rx' | 'system'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'lab', label: 'Lab Results' },
  { key: 'rx', label: 'Prescriptions' },
  { key: 'system', label: 'System' },
]

function filterByTab(notifications: NotificationItem[], tab: TabKey): NotificationItem[] {
  if (tab === 'all') return notifications
  if (tab === 'lab') return notifications.filter(n => (LAB_TYPES as readonly string[]).includes(n.type))
  if (tab === 'rx') return notifications.filter(n => (RX_TYPES as readonly string[]).includes(n.type))
  return notifications.filter(n => (SYSTEM_TYPES as readonly string[]).includes(n.type))
}

// --- Notification type display helpers ---

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

function getIconCategory(type: string): 'lab' | 'rx' | 'system' {
  if ((LAB_TYPES as readonly string[]).includes(type)) return 'lab'
  if ((RX_TYPES as readonly string[]).includes(type)) return 'rx'
  return 'system'
}

// --- Deep link route mapping ---

function getDeepLink(notification: NotificationItem): string | null {
  const { type, payload } = notification
  switch (type) {
    case 'LAB_RESULT_AVAILABLE':
    case 'LAB_RESULT_ESCALATION':
      // Navigate to patient lab results if we have a diagnosticReportId
      return payload.diagnosticReportId ? `/patient/${payload.diagnosticReportId}#lab-results` : null
    case 'PRESCRIPTION_READY':
      return null // No patientId in current payload schema
    case 'SYNC_CONFLICT':
      return '/conflicts'
    case 'CONSENT_CHANGE':
    case 'ALLERGY_UPDATE':
      return null // No patientId in current payload schema
    default:
      return null
  }
}

// --- Type Icons (SVG) ---

function BeakerIcon({ id }: { id: string }) {
  return (
    <svg data-testid={`icon-lab-${id}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-blue-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
    </svg>
  )
}

function PillIcon({ id }: { id: string }) {
  return (
    <svg data-testid={`icon-rx-${id}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-green-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  )
}

function GearIcon({ id }: { id: string }) {
  return (
    <svg data-testid={`icon-system-${id}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5 text-neutral-500">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}

function TypeIcon({ type, id }: { type: string; id: string }) {
  const category = getIconCategory(type)
  if (category === 'lab') return <BeakerIcon id={id} />
  if (category === 'rx') return <PillIcon id={id} />
  return <GearIcon id={id} />
}

// --- Main Component ---

export function NotificationCenter() {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const router = useRouter()

  const {
    notifications,
    unreadCount,
    loading,
    error,
    acknowledge,
    acknowledgeAll,
  } = useNotificationPoll()

  const filtered = filterByTab(notifications, activeTab)

  const handleNotificationClick = useCallback(async (notification: NotificationItem) => {
    // Acknowledge on click
    if (notification.status !== 'ACKNOWLEDGED') {
      await acknowledge(notification.id)
    }

    // Audit PHI access for lab result navigation
    const deepLink = getDeepLink(notification)
    if (deepLink && notification.payload.diagnosticReportId) {
      try {
        const report = await db.diagnosticReports.get(notification.payload.diagnosticReportId)
        if (report) {
          auditPhiAccess(
            AuditAction.PHI_READ,
            AuditResourceType.LAB_RESULT,
            notification.payload.diagnosticReportId,
            report.subject.reference?.replace('Patient/', ''),
            { phiAccess: 'notification_center_navigate' },
          )
        }
      } catch {
        // Audit failure logged internally
      }
    }

    // Navigate to deep link if available
    if (deepLink) {
      router.push(deepLink)
    }
  }, [acknowledge, router])

  return (
    <div className="flex flex-col gap-4">
      {/* Header with Mark All Read */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-neutral-500">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </span>
        </div>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={acknowledgeAll}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Mark All Read"
        >
          Mark All Read
        </button>
      </div>

      {/* Tab bar */}
      <div role="tablist" className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Notifications unavailable offline. Please check your connection.
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-12 text-center text-sm text-neutral-500">
          Loading notifications...
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-neutral-500">
          No notifications
        </div>
      )}

      {/* Notification list */}
      {!loading && filtered.length > 0 && (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
          {filtered.map(n => (
            <NotificationRow
              key={n.id}
              notification={n}
              onClick={handleNotificationClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Notification Row ---

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationItem
  onClick: (n: NotificationItem) => void
}) {
  const isUnread = notification.status !== 'ACKNOWLEDGED'
  const isEscalation = notification.type === 'LAB_RESULT_ESCALATION'
  const deepLink = getDeepLink(notification)

  return (
    <div
      data-testid={`notification-${notification.id}`}
      role="button"
      tabIndex={0}
      onClick={() => onClick(notification)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onClick(notification) }}
      className={`flex items-start gap-3 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
        deepLink ? 'cursor-pointer hover:bg-neutral-50' : ''
      } ${isUnread ? 'bg-blue-50' : ''} ${isEscalation ? 'border-s-4 border-s-red-500' : ''}`}
    >
      {/* Type icon */}
      <div className="mt-0.5 shrink-0">
        <TypeIcon type={notification.type} id={notification.id} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${isEscalation ? 'text-red-700' : 'text-neutral-900'}`}>
            {notificationLabel(notification.type)}
          </p>
          {isUnread && (
            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Unread" />
          )}
        </div>

        {/* Source info */}
        {notification.payload.testCategory && (
          <p className="mt-0.5 text-xs text-neutral-600">
            {notification.payload.testCategory}
            {notification.payload.labName && ` — ${notification.payload.labName}`}
          </p>
        )}
        {notification.payload.message && !notification.payload.testCategory && (
          <p className="mt-0.5 text-xs text-neutral-600">
            {notification.payload.message}
          </p>
        )}

        {/* Timestamp */}
        <p className="mt-1 text-xs text-neutral-400">
          {formatTimestamp(notification.createdAt)}
        </p>
      </div>
    </div>
  )
}

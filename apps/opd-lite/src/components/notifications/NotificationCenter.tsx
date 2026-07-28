'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate } from '@ultranos/ui-kit'
import { Beaker, Check, Settings } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import type { NotificationItem } from '@/lib/notification-api'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { notificationLabelKey } from '@/lib/notification-label'

// --- Type grouping for tab filters ---

const LAB_TYPES = ['LAB_RESULT_AVAILABLE', 'LAB_RESULT_ESCALATION'] as const
const RX_TYPES = ['PRESCRIPTION_READY'] as const
const SYSTEM_TYPES = ['SYNC_CONFLICT', 'CONSENT_CHANGE', 'ALLERGY_UPDATE'] as const

type TabKey = 'all' | 'lab' | 'rx' | 'system'

type TabDef = { key: TabKey; labelKey: string }

const TABS: TabDef[] = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'lab', labelKey: 'tabLabResults' },
  { key: 'rx', labelKey: 'tabPrescriptions' },
  { key: 'system', labelKey: 'tabSystem' },
]

function filterByTab(notifications: NotificationItem[], tab: TabKey): NotificationItem[] {
  if (tab === 'all') return notifications
  if (tab === 'lab') return notifications.filter(n => (LAB_TYPES as readonly string[]).includes(n.type))
  if (tab === 'rx') return notifications.filter(n => (RX_TYPES as readonly string[]).includes(n.type))
  return notifications.filter(n => (SYSTEM_TYPES as readonly string[]).includes(n.type))
}

// --- Notification type display helpers ---

// notificationLabelKey is imported from @/lib/notification-label (shared with NotificationPanel)

function formatTimestamp(iso: string, locale: 'en' | 'ar' | 'prs' | 'ps'): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return formatDate(d, locale)
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

// --- Type Icons ---

function TypeIcon({ type, id }: { type: string; id: string }) {
  const category = getIconCategory(type)
  if (category === 'lab') return <Beaker data-testid={`icon-lab-${id}`} className="h-5 w-5 text-primary" />
  if (category === 'rx') return <Check data-testid={`icon-rx-${id}`} className="h-5 w-5 text-success" />
  return <Settings data-testid={`icon-system-${id}`} className="h-5 w-5 text-muted-foreground" />
}

// --- Main Component ---

type StatusKey = 'all' | 'unread' | 'read'

function matchesSearch(n: NotificationItem, query: string): boolean {
  if (!query) return true
  const haystack = [
    n.type,
    n.payload?.message,
    n.payload?.testCategory,
    n.payload?.labName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function NotificationCenter() {
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusKey>('all')
  const router = useRouter()
  const t = useTranslations('notificationCenter')

  const {
    notifications,
    unreadCount,
    loading,
    error,
    acknowledge,
    acknowledgeAll,
  } = useNotificationPoll()

  const query = search.trim().toLowerCase()
  const filtered = filterByTab(notifications, activeTab).filter((n) => {
    const isRead = n.status === 'ACKNOWLEDGED'
    if (statusFilter === 'unread' && isRead) return false
    if (statusFilter === 'read' && !isRead) return false
    return matchesSearch(n, query)
  })

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
      {/* Toolbar: tab-bar + search + status filter + Mark All Read (matches Patients directory) */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <Input
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusKey)}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('statusAll')}
        >
          <option value="all">{t('statusAll')}</option>
          <option value="unread">{t('statusUnread')}</option>
          <option value="read">{t('statusRead')}</option>
        </select>

        <Button
          variant="primary"
          disabled={unreadCount === 0}
          onClick={acknowledgeAll}
          aria-label={t('markAllReadAria')}
        >
          {t('markAllRead')}
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Alert variant="warning" role="alert">{t('offlineError')}</Alert>
      )}

      {/* Content panel: loading / empty / list */}
      {!error && (
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
              {t('loadingNotifications')}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                title={notifications.length > 0 ? t('noResults') : t('noNotifications')}
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
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
  const locale = useLocale() as 'en' | 'ar' | 'prs' | 'ps'
  const tNotif = useTranslations('notifications')
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
      className={`flex items-start gap-3 px-4 py-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
        deepLink ? 'cursor-pointer hover:bg-muted' : ''
      } ${isUnread ? 'bg-primary/10' : ''} ${isEscalation ? 'ring-1 ring-inset ring-destructive/40' : ''}`}
    >
      {/* Type icon */}
      <div className="mt-0.5 shrink-0">
        <TypeIcon type={notification.type} id={notification.id} />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${isEscalation ? 'text-destructive' : 'text-foreground'}`}>
            {tNotif(notificationLabelKey(notification.type))}
          </p>
          {isUnread && (
            <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />
          )}
        </div>

        {/* Source info */}
        {notification.payload.testCategory && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {notification.payload.testCategory}
            {notification.payload.labName && ` · ${notification.payload.labName}`}
          </p>
        )}
        {notification.payload.message && !notification.payload.testCategory && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {notification.payload.message}
          </p>
        )}

        {/* Timestamp */}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatTimestamp(notification.createdAt, locale)}
        </p>
      </div>
    </div>
  )
}

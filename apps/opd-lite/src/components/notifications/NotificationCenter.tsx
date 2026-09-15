'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { formatDate, formatDateTime } from '@ultranos/ui-kit'
import { Button } from '@/components/ui/Button'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { useNotificationPoll } from '@/lib/use-notification-poll'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import type { NotificationItem } from '@/lib/notification-api'
import type { NotificationDetailField } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { db } from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { NotificationRow } from '@ultranos/ui-kit/components/ui/notification-row'
import { NotificationDetailModal } from '@ultranos/ui-kit/components/ui/notification-detail-modal'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '@ultranos/ui-kit/notification-presentation'
import { useNotificationPatient } from '@/hooks/useNotificationPatient'

// --- Type grouping for tab filters ---

const LAB_TYPES = ['LAB_RESULT_AVAILABLE', 'LAB_RESULT_ESCALATION', 'ORDER_RECEIVED'] as const
const RX_TYPES = ['PRESCRIPTION_READY', 'PRESCRIPTION_DISPENSED', 'DISPENSE_REVIEW_RESOLVED'] as const
const SYSTEM_TYPES = [
  'SYNC_CONFLICT', 'CONSENT_CHANGE', 'ALLERGY_UPDATE',
  'GUARDIAN_LINKED', 'GUARDIAN_UNLINKED',
  'LICENSE_EXPIRED', 'LICENSE_EXPIRY_WARNING', 'PROVIDER_SUSPENDED',
  'LAB_APPROVED', 'LAB_SUSPENDED', 'LAB_REACTIVATED',
  'KYC_APPROVED', 'KYC_REJECTED', 'KYC_MORE_INFO_REQUESTED',
  'OUTBREAK_MODE_ACTIVATED', 'OUTBREAK_MODE_DEACTIVATED',
] as const

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

// --- Deep link route mapping ---

function getDeepLink(notification: NotificationItem): string | null {
  const { type, payload } = notification
  switch (type) {
    case 'LAB_RESULT_AVAILABLE':
    case 'LAB_RESULT_ESCALATION':
      return payload.diagnosticReportId ? `/patient/${payload.diagnosticReportId}#lab-results` : null
    case 'SYNC_CONFLICT':
      return '/conflicts'
    case 'CONSENT_CHANGE':
    case 'ALLERGY_UPDATE':
      return null
    default:
      return null
  }
}

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
  const [openId, setOpenId] = useState<string | null>(null)
  const router = useRouter()
  const t = useTranslations('notificationCenter')
  const tNotif = useTranslations('notifications')

  const {
    notifications,
    unreadCount,
    loading,
    error,
    acknowledge,
    acknowledgeAll,
    remove,
  } = useNotificationPoll()

  const query = search.trim().toLowerCase()
  const filtered = filterByTab(notifications, activeTab).filter((n) => {
    const isRead = n.status === 'ACKNOWLEDGED'
    if (statusFilter === 'unread' && isRead) return false
    if (statusFilter === 'read' && !isRead) return false
    return matchesSearch(n, query)
  })

  const handleNotificationClick = useCallback(async (notification: NotificationItem) => {
    if (notification.status !== 'ACKNOWLEDGED') {
      await acknowledge(notification.id)
    }

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
  }, [acknowledge])

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
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

      {/* Content panel */}
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
                <NotificationRowWrapper
                  key={n.id}
                  notification={n}
                  openId={openId}
                  setOpenId={setOpenId}
                  onNotificationClick={handleNotificationClick}
                  onMarkRead={acknowledge}
                  onNavigate={(path) => router.push(path)}
                  onRemove={remove}
                  tNotif={tNotif}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Notification Row Wrapper (resolves descriptor → ui-kit NotificationRow + modal) ---

function NotificationRowWrapper({
  notification: n,
  openId,
  setOpenId,
  onNotificationClick,
  onMarkRead,
  onNavigate,
  onRemove,
  tNotif,
}: {
  notification: NotificationItem
  openId: string | null
  setOpenId: (id: string | null) => void
  onNotificationClick: (n: NotificationItem) => Promise<void>
  onMarkRead: (id: string) => Promise<void>
  onNavigate: (path: string) => void
  onRemove: (id: string) => Promise<void>
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
  const deepLink = getDeepLink(n)
  const isOpen = openId === n.id

  // Patient lookup — only runs when modal is open (hook is always called but
  // resolves synchronously to null when notification is not patient-bearing)
  const { name: patientName, loading: patientLoading } = useNotificationPatient(
    isOpen ? n : null,
  )

  // Build detail rows from non-PHI notification fields
  const details: NotificationDetailField[] = []

  // Order / Reference ID
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

  // Test / Category
  const testCategory = n.payload?.testCategory ?? (n.bodyParams as Record<string, string> | undefined)?.testCategory
  if (testCategory) {
    details.push({
      label: tNotif('field.test' as Parameters<typeof tNotif>[0]),
      value: String(testCategory),
    })
  }

  // Lab name
  const labName = n.payload?.labName ?? (n.bodyParams as Record<string, string> | undefined)?.labName
  if (labName) {
    details.push({
      label: tNotif('field.lab' as Parameters<typeof tNotif>[0]),
      value: String(labName),
    })
  }

  // Status (non-PHI operational field)
  const statusValue = n.payload?.status
  if (statusValue) {
    details.push({
      label: tNotif('field.status' as Parameters<typeof tNotif>[0]),
      value: statusValue,
    })
  }

  // Received timestamp
  const receivedTs = n.payload?.acknowledgedAt ?? n.createdAt
  if (receivedTs) {
    details.push({
      label: tNotif('field.received' as Parameters<typeof tNotif>[0]),
      value: formatDateTime(new Date(receivedTs), locale),
    })
  }

  return (
    <div data-testid={`notification-${n.id}`}>
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
          void onNotificationClick(n)
        }}
        onMarkRead={n.status !== 'ACKNOWLEDGED' ? () => { void onMarkRead(n.id) } : undefined}
        onDelete={() => { void onRemove(n.id) }}
        markReadLabel={tNotif('markRead' as Parameters<typeof tNotif>[0])}
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
    </div>
  )
}

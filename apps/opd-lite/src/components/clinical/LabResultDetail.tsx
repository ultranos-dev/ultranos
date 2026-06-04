'use client'

import { useEffect, useState, useCallback } from 'react'
import { Check } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { db, type LocalDiagnosticReport } from '@/lib/db'
import {
  acknowledgeNotification,
  fetchNotifications,
  type NotificationItem,
} from '@/lib/notification-api'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

interface LabResultDetailProps {
  report: LocalDiagnosticReport
  /** Notification linked to this report, if navigated from notification panel */
  notification?: NotificationItem
  onBack: () => void
}

/** Content types safe to render inline */
const SAFE_IMAGE_PREFIXES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
const SAFE_CONTENT_TYPES = [...SAFE_IMAGE_PREFIXES, 'application/pdf']

function _isSafeContentType(ct: string): boolean {
  return SAFE_CONTENT_TYPES.some(safe =>
    ct === safe || (safe.endsWith('+xml') ? false : ct.startsWith(safe.split('/')[0] + '/') && SAFE_IMAGE_PREFIXES.some(p => ct === p)),
  )
}

function formatDateTime(iso?: string): string {
  if (!iso) return 'Unknown'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: string): string {
  switch (status) {
    case 'preliminary': return 'Preliminary'
    case 'final': return 'Final'
    case 'amended': return 'Amended'
    case 'corrected': return 'Corrected'
    case 'registered': return 'Registered'
    default: return status
  }
}

function renderAttachment(attachment: { contentType?: string; data?: string; url?: string; title?: string }, index: number) {
  const contentType = attachment.contentType ?? ''

  // Validate URL protocol if url is provided (no data)
  if (attachment.url && !attachment.data) {
    try {
      const parsed = new URL(attachment.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    } catch {
      return null
    }
  }

  const dataUri = attachment.data
    ? `data:${contentType};base64,${attachment.data}`
    : attachment.url

  if (!dataUri) return null

  // Only render known-safe content types inline
  if (SAFE_IMAGE_PREFIXES.some(p => contentType === p)) {
    return (
      <div key={index} className="mt-3">
        {attachment.title && (
          <p className="mb-1 text-sm font-medium text-foreground">{attachment.title}</p>
        )}
        <img
          src={dataUri}
          alt={attachment.title ?? `Attachment ${index + 1}`}
          className="max-w-full rounded-xl ring-[0.65px] ring-gray-400/40"
        />
      </div>
    )
  }

  if (contentType === 'application/pdf') {
    return (
      <div key={index} className="mt-3">
        {attachment.title && (
          <p className="mb-1 text-sm font-medium text-foreground">{attachment.title}</p>
        )}
        <embed
          src={dataUri}
          type="application/pdf"
          className="h-96 w-full rounded-xl ring-[0.65px] ring-gray-400/40"
          title={attachment.title ?? `PDF ${index + 1}`}
        />
      </div>
    )
  }

  // Unsupported content type — download only (no inline rendering)
  if (attachment.data) {
    return (
      <div key={index} className="mt-3">
        <a
          href={dataUri}
          download={attachment.title ?? `attachment-${index + 1}`}
          className="text-sm font-medium text-primary underline hover:text-primary"
        >
          Download {attachment.title ?? `Attachment ${index + 1}`}
        </a>
      </div>
    )
  }

  return null
}

export function LabResultDetail({ report, notification: notificationProp, onBack }: LabResultDetailProps) {
  const [notification, setNotification] = useState<NotificationItem | null>(notificationProp ?? null)
  const [acknowledged, setAcknowledged] = useState(
    notificationProp?.status === 'ACKNOWLEDGED' || !!report.acknowledgedAt,
  )
  const [acknowledging, setAcknowledging] = useState(false)

  // AC #3: Self-lookup notification if not passed as prop
  useEffect(() => {
    if (notificationProp || notification) return
    let cancelled = false
    async function lookupNotification() {
      try {
        const { notifications } = await fetchNotifications()
        const match = notifications.find(
          (n) => n.payload.diagnosticReportId === report.id && n.status !== 'ACKNOWLEDGED',
        )
        if (!cancelled && match) {
          setNotification(match)
        }
      } catch {
        // Best-effort — notification lookup is non-critical
      }
    }
    lookupNotification()
    return () => { cancelled = true }
  }, [report.id, notificationProp, notification])

  // AC #5: Audit PHI READ on detail view
  useEffect(() => {
    const patientId = report.subject.reference?.replace('Patient/', '') ?? ''
    auditPhiAccess(
      AuditAction.PHI_READ,
      AuditResourceType.LAB_RESULT,
      report.id,
      patientId,
      { phiAccess: 'lab_result_detail_view' },
    )
  }, [report.id, report.subject.reference])

  const handleAcknowledge = useCallback(async () => {
    if (!notification || acknowledged || acknowledging) return
    setAcknowledging(true)
    try {
      await acknowledgeNotification(notification.id)
      setAcknowledged(true)
      // Persist acknowledgement locally for urgent indicator tracking
      await db.diagnosticReports.update(report.id, {
        acknowledgedAt: new Date().toISOString(),
      })
    } catch {
      // Best-effort — network may be unavailable
    } finally {
      setAcknowledging(false)
    }
  }, [notification, acknowledged, acknowledging, report.id])

  const loincDisplay =
    report.code.coding?.[0]?.display ?? report.code.coding?.[0]?.code ?? 'Unknown Test'
  const loincCode = report.code.coding?.[0]?.code
  const labName = report.performer?.[0]?.display ?? 'Unknown Lab'
  const performers = Array.isArray(report.performer) ? report.performer : []

  return (
    <div data-testid="lab-result-detail">
      {/* Back button */}
      <Button
        variant="ghost"
        type="button"
        onClick={onBack}
        className="mb-4"
        aria-label="Back to lab results"
      >
        &larr; Back to Results
      </Button>

      <h3 className="text-xl font-bold text-foreground">{loincDisplay}</h3>
      {loincCode && (
        <p className="text-xs text-muted-foreground">LOINC: {loincCode}</p>
      )}

      {/* Metadata grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">Status</span>
          <p className="font-semibold text-foreground">{statusLabel(report.status)}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Collection Date</span>
          <p className="font-semibold text-foreground">
            {formatDateTime(report.effectiveDateTime)}
          </p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Issued</span>
          <p className="font-semibold text-foreground">
            {formatDateTime(report.issued)}
          </p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Lab</span>
          <p className="font-semibold text-foreground">{labName}</p>
        </div>
      </div>

      {/* Performers */}
      {performers.length > 1 && (
        <div className="mt-4">
          <span className="text-sm font-medium text-muted-foreground">Performers</span>
          <ul className="mt-1 text-sm text-foreground">
            {performers.map((p, i) => (
              <li key={i}>{p.display ?? p.reference}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Conclusion */}
      {report.conclusion && (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-gray-400/40 bg-muted p-4">
          <h4 className="text-sm font-bold text-foreground">Conclusion</h4>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">
            {report.conclusion}
          </p>
        </div>
      )}

      {/* Presented form (PDF / images) */}
      {report.presentedForm && report.presentedForm.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-bold text-foreground">Attached Files</h4>
          {report.presentedForm.map((attachment, i) => renderAttachment(attachment, i))}
        </div>
      )}

      {/* No file, no conclusion — show text-based summary hint */}
      {!report.conclusion && (!report.presentedForm || report.presentedForm.length === 0) && (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-gray-400/40 bg-muted p-4 text-sm text-muted-foreground">
          No report content or attachments available. Result data may be pending.
        </div>
      )}

      {/* Acknowledge button — AC #3 */}
      {notification && !acknowledged && (
        <Button
          variant="primary"
          type="button"
          onClick={handleAcknowledge}
          disabled={acknowledging}
          className="mt-6"
          data-testid="acknowledge-button"
        >
          {acknowledging ? 'Acknowledging...' : 'Acknowledge Result'}
        </Button>
      )}

      {acknowledged && (
        <div className="mt-6 flex items-center gap-2 text-sm font-medium text-success">
          <Check className="h-5 w-5" />
          Result Acknowledged
        </div>
      )}
    </div>
  )
}

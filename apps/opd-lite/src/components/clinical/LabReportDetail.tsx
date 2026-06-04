'use client'

/**
 * Lab Report Detail View — OPD Projection (Story 52.4 — Task 6)
 *
 * Full detail view for clinician use (OPD projection from Story 42.6):
 * - Report metadata, LOINC code, status, dates
 * - Performer (lab name + supervisor reference)
 * - Conclusion narrative
 * - Attachments (PDF / images — inline rendering)
 * - Ultranos extensions: flagLevel, sampleId, templateVersion, source lab
 * - Amendment badge for amended/corrected reports
 * - PDF export / print button
 *
 * Data minimization: this is the OPD (clinician) projection — full data shown.
 * The patient-projection simplified view lives in Patient-Lite (LabResultCard).
 *
 * AC: 5 (Story 52.4)
 * CLAUDE.md Rule #6: audit PHI access on view.
 */

import { useEffect, useCallback, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Check, Printer } from '@ultranos/ui-kit/icons'
import { db, type LocalDiagnosticReport } from '@/lib/db'
import { acknowledgeNotification, fetchNotifications, type NotificationItem } from '@/lib/notification-api'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

interface LabReportDetailProps {
  report: LocalDiagnosticReport
  notification?: NotificationItem
  onBack: () => void
}

const SAFE_IMAGE_PREFIXES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

function formatDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    preliminary: 'Preliminary',
    final: 'Final',
    amended: 'Amended',
    corrected: 'Corrected',
    registered: 'Registered',
    cancelled: 'Cancelled',
  }
  return labels[status] ?? status
}

function flagBadge(flag?: string) {
  switch (flag) {
    case 'critical':
      return <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-bold text-destructive">Critical</span>
    case 'abnormal':
      return <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">Abnormal</span>
    default:
      return <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-bold text-success">Normal</span>
  }
}

function renderAttachment(
  attachment: { contentType?: string; data?: string; url?: string; title?: string },
  index: number,
) {
  const contentType = attachment.contentType ?? ''
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

  if (SAFE_IMAGE_PREFIXES.some((p) => contentType === p)) {
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

export function LabReportDetail({ report, notification: notificationProp, onBack }: LabReportDetailProps) {
  const [notification, setNotification] = useState<NotificationItem | null>(notificationProp ?? null)
  const [acknowledged, setAcknowledged] = useState(
    notificationProp?.status === 'ACKNOWLEDGED' || !!report.acknowledgedAt,
  )
  const [acknowledging, setAcknowledging] = useState(false)

  // Self-lookup notification if not passed
  useEffect(() => {
    if (notificationProp || notification) return
    let cancelled = false
    async function lookup() {
      try {
        const { notifications } = await fetchNotifications()
        const match = notifications.find(
          (n) => n.payload.diagnosticReportId === report.id && n.status !== 'ACKNOWLEDGED',
        )
        if (!cancelled && match) setNotification(match)
      } catch { /* best-effort */ }
    }
    lookup()
    return () => { cancelled = true }
  }, [report.id, notificationProp, notification])

  // AC #10: audit PHI READ on detail view — CLAUDE.md Rule #6
  useEffect(() => {
    const patientId = report.subject.reference?.replace('Patient/', '') ?? ''
    auditPhiAccess(
      AuditAction.PHI_READ,
      AuditResourceType.LAB_RESULT,
      report.id,
      patientId,
      { phiAccess: 'lab_report_detail_viewed' },
    )
  }, [report.id, report.subject.reference])

  const handleAcknowledge = useCallback(async () => {
    if (!notification || acknowledged || acknowledging) return
    setAcknowledging(true)
    try {
      await acknowledgeNotification(notification.id)
      setAcknowledged(true)
      await db.diagnosticReports.update(report.id, { acknowledgedAt: new Date().toISOString() })
    } catch { /* best-effort */ } finally {
      setAcknowledging(false)
    }
  }, [notification, acknowledged, acknowledging, report.id])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const loincDisplay =
    report.code.coding?.[0]?.display ?? report.code.coding?.[0]?.code ?? 'Unknown Test'
  const loincCode = report.code.coding?.[0]?.code
  const performers = Array.isArray(report.performer) ? report.performer : []
  const isAmended = report.status === 'amended' || report.status === 'corrected'
  const ext = report._ultranos

  return (
    <div data-testid="lab-report-detail">
      {/* Back button */}
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" type="button" onClick={onBack} aria-label="Back to lab results">
          &larr; Back to Results
        </Button>
        <Button variant="ghost" type="button" onClick={handlePrint} aria-label="Print report">
          <Printer className="h-4 w-4" aria-hidden />
          <span className="ms-1 text-sm">Print</span>
        </Button>
      </div>

      {/* Title + amendment badge */}
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="text-xl font-bold text-foreground">{loincDisplay}</h3>
        {isAmended && (
          <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary">
            {statusLabel(report.status)}
          </span>
        )}
        {ext?.flagLevel && flagBadge(ext.flagLevel)}
      </div>

      {loincCode && (
        <p className="mt-0.5 text-xs text-muted-foreground">LOINC: {loincCode}</p>
      )}

      {/* Metadata grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="font-medium text-muted-foreground">Status</span>
          <p className="font-semibold text-foreground">{statusLabel(report.status)}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Collection Date</span>
          <p className="font-semibold text-foreground">{formatDateTime(report.effectiveDateTime)}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Issued</span>
          <p className="font-semibold text-foreground">{formatDateTime(report.issued)}</p>
        </div>
        <div>
          <span className="font-medium text-muted-foreground">Lab</span>
          <p className="font-semibold text-foreground">{performers[0]?.display ?? ext?.labId ?? '—'}</p>
        </div>
        {ext?.sampleId && (
          <div>
            <span className="font-medium text-muted-foreground">Sample ID</span>
            <p className="font-semibold text-foreground font-mono text-xs">{ext.sampleId.slice(0, 8)}…</p>
          </div>
        )}
        {ext?.templateVersion && (
          <div>
            <span className="font-medium text-muted-foreground">Template</span>
            <p className="font-semibold text-foreground text-xs">{ext.templateVersion}</p>
          </div>
        )}
      </div>

      {/* Performers */}
      {performers.length > 1 && (
        <div className="mt-4">
          <span className="text-sm font-medium text-muted-foreground">Performers</span>
          <ul className="mt-1 space-y-0.5 text-sm text-foreground">
            {performers.map((p, i) => (
              <li key={i}>{p.display ?? p.reference}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Result observations (references — shown for completeness) */}
      {report.result && report.result.length > 0 && (
        <div className="mt-4">
          <span className="text-sm font-medium text-muted-foreground">Observation References</span>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {report.result.map((ref, i) => (
              <li key={i} className="font-mono">{ref.reference}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Conclusion */}
      {report.conclusion && (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-gray-400/40 bg-muted p-4">
          <h4 className="text-sm font-bold text-foreground">Conclusion</h4>
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{report.conclusion}</p>
        </div>
      )}

      {/* Attachments */}
      {report.presentedForm && report.presentedForm.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-bold text-foreground">Attached Files</h4>
          {report.presentedForm.map((attachment, i) => renderAttachment(attachment, i))}
        </div>
      )}

      {/* Empty state */}
      {!report.conclusion && (!report.presentedForm || report.presentedForm.length === 0) && (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-gray-400/40 bg-muted p-4 text-sm text-muted-foreground">
          No report content or attachments available. Result data may be pending.
        </div>
      )}

      {/* Acknowledge button */}
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

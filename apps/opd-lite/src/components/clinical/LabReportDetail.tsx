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
      return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">Critical</span>
    case 'abnormal':
      return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Abnormal</span>
    default:
      return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">Normal</span>
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
          <p className="mb-1 text-sm font-medium text-neutral-700">{attachment.title}</p>
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
          <p className="mb-1 text-sm font-medium text-neutral-700">{attachment.title}</p>
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
          className="text-sm font-medium text-blue-600 underline hover:text-blue-800"
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
        <h3 className="text-xl font-bold text-neutral-900">{loincDisplay}</h3>
        {isAmended && (
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
            {statusLabel(report.status)}
          </span>
        )}
        {ext?.flagLevel && flagBadge(ext.flagLevel)}
      </div>

      {loincCode && (
        <p className="mt-0.5 text-xs text-neutral-500">LOINC: {loincCode}</p>
      )}

      {/* Metadata grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="font-medium text-neutral-500">Status</span>
          <p className="font-semibold text-neutral-900">{statusLabel(report.status)}</p>
        </div>
        <div>
          <span className="font-medium text-neutral-500">Collection Date</span>
          <p className="font-semibold text-neutral-900">{formatDateTime(report.effectiveDateTime)}</p>
        </div>
        <div>
          <span className="font-medium text-neutral-500">Issued</span>
          <p className="font-semibold text-neutral-900">{formatDateTime(report.issued)}</p>
        </div>
        <div>
          <span className="font-medium text-neutral-500">Lab</span>
          <p className="font-semibold text-neutral-900">{performers[0]?.display ?? ext?.labId ?? '—'}</p>
        </div>
        {ext?.sampleId && (
          <div>
            <span className="font-medium text-neutral-500">Sample ID</span>
            <p className="font-semibold text-neutral-900 font-mono text-xs">{ext.sampleId.slice(0, 8)}…</p>
          </div>
        )}
        {ext?.templateVersion && (
          <div>
            <span className="font-medium text-neutral-500">Template</span>
            <p className="font-semibold text-neutral-900 text-xs">{ext.templateVersion}</p>
          </div>
        )}
      </div>

      {/* Performers */}
      {performers.length > 1 && (
        <div className="mt-4">
          <span className="text-sm font-medium text-neutral-500">Performers</span>
          <ul className="mt-1 space-y-0.5 text-sm text-neutral-900">
            {performers.map((p, i) => (
              <li key={i}>{p.display ?? p.reference}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Result observations (references — shown for completeness) */}
      {report.result && report.result.length > 0 && (
        <div className="mt-4">
          <span className="text-sm font-medium text-neutral-500">Observation References</span>
          <ul className="mt-1 space-y-0.5 text-xs text-neutral-500">
            {report.result.map((ref, i) => (
              <li key={i} className="font-mono">{ref.reference}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Conclusion */}
      {report.conclusion && (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-gray-400/40 bg-neutral-50 p-4">
          <h4 className="text-sm font-bold text-neutral-700">Conclusion</h4>
          <p className="mt-1 text-sm text-neutral-900 whitespace-pre-wrap">{report.conclusion}</p>
        </div>
      )}

      {/* Attachments */}
      {report.presentedForm && report.presentedForm.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-bold text-neutral-700">Attached Files</h4>
          {report.presentedForm.map((attachment, i) => renderAttachment(attachment, i))}
        </div>
      )}

      {/* Empty state */}
      {!report.conclusion && (!report.presentedForm || report.presentedForm.length === 0) && (
        <div className="mt-4 rounded-xl ring-[0.65px] ring-gray-400/40 bg-neutral-50 p-4 text-sm text-neutral-500">
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
        <div className="mt-6 flex items-center gap-2 text-sm font-medium text-green-700">
          <Check className="h-5 w-5" />
          Result Acknowledged
        </div>
      )}
    </div>
  )
}

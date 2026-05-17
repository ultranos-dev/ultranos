'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

type ReviewAction = 'DISMISS' | 'ESCALATE' | 'SUSPEND_PROVIDER'

interface TimelineEntry {
  date: string
  count: number
}

interface AlertDetail {
  id: string
  practitionerId: string
  practitionerName: string
  anomalyType: string
  threshold: number
  actualValue: number
  dateRangeStart: string
  dateRangeEnd: string
  severity: string
  status: string
  createdAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewAction: string | null
  reviewReason: string | null
  prescribingSummary: {
    totalPrescriptions: number
    controlledSubstanceCount: number
    patientCount: number
  }
  timeline: TimelineEntry[]
}

const ANOMALY_TYPE_LABELS: Record<string, string> = {
  CONTROLLED_SUBSTANCE_VOLUME: 'Controlled Substance Volume',
  DRUG_FREQUENCY: 'Drug Frequency',
}

function SeverityBadge({ severity }: { severity: string }) {
  const colorMap: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-800',
    MEDIUM: 'bg-orange-100 text-orange-800',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${colorMap[severity] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    UNREVIEWED: 'bg-amber-100 text-amber-800',
    ESCALATED: 'bg-purple-100 text-purple-800',
    DISMISSED: 'bg-neutral-100 text-neutral-600',
    SUSPENDED: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${colorMap[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** AC #5: Confirmation dialog with required reason field */
function ReviewDialog({
  action,
  onConfirm,
  onCancel,
  submitting,
}: {
  action: ReviewAction
  onConfirm: (reason: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [reason, setReason] = useState('')

  const config: Record<ReviewAction, { title: string; description: string; buttonLabel: string; buttonColor: string }> = {
    DISMISS: {
      title: 'Dismiss Alert',
      description: 'Dismiss this anomaly alert? The alert will be marked as reviewed and closed.',
      buttonLabel: 'Dismiss',
      buttonColor: 'bg-neutral-600 hover:bg-neutral-700',
    },
    ESCALATE: {
      title: 'Escalate Alert',
      description: 'Escalate this alert for further investigation? The alert will be flagged for senior review.',
      buttonLabel: 'Escalate',
      buttonColor: 'bg-purple-600 hover:bg-purple-700',
    },
    SUSPEND_PROVIDER: {
      title: 'Suspend Provider',
      description: 'This will immediately terminate the provider\'s active sessions and block clinical access.',
      buttonLabel: 'Suspend Provider',
      buttonColor: 'bg-red-600 hover:bg-red-700',
    },
  }

  const c = config[action]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{c.title}</h2>
        <p className="mt-3 text-sm text-neutral-700">{c.description}</p>

        {action === 'SUSPEND_PROVIDER' && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            Warning: This will immediately terminate the provider&apos;s active sessions and block clinical access.
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="reason" className="block text-sm font-medium text-neutral-700">
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Enter a reason for this action (required)..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting || !reason.trim()}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors ${c.buttonColor}`}
          >
            {submitting ? 'Processing...' : c.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AlertDetailPage() {
  const params = useParams()
  const router = useRouter()
  const alertId = params.alertId as string

  const [alert, setAlert] = useState<AlertDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.getAnomalyDetail.query({ alertId })
      setAlert(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load alert details')
    } finally {
      setLoading(false)
    }
  }, [alertId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  async function handleAction(reason: string) {
    if (!pendingAction || !alert) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.reviewAnomaly.mutate({
        alertId,
        action: pendingAction,
        reason,
      })
      setPendingAction(null)
      setSuccessMessage(`Alert ${pendingAction === 'DISMISS' ? 'dismissed' : pendingAction === 'ESCALATE' ? 'escalated' : 'reviewed and provider suspended'} successfully.`)
      setTimeout(() => {
        router.push('/alerts')
      }, 1500)
    } catch (err: any) {
      setError(err?.message ?? `Failed to ${pendingAction.toLowerCase()} alert`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-neutral-500">Loading alert details...</div>
  }

  if (error && !alert) {
    return (
      <div>
        <button onClick={() => router.push('/alerts')} className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to Alerts</button>
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      </div>
    )
  }

  if (!alert) return null

  const isReviewable = alert.status === 'UNREVIEWED' || alert.status === 'ESCALATED'
  const maxTimelineCount = Math.max(...alert.timeline.map((t) => t.count), 1)

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.push('/alerts')} className="text-sm text-blue-600 hover:text-blue-800">&larr; Back to Alerts</button>

      {/* Header */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{alert.practitionerName}</h1>
          <p className="mt-1 text-neutral-500">
            {ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType} — Detected {formatDate(alert.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <StatusBadge status={alert.status} />
        </div>
      </div>

      {/* Success toast */}
      {successMessage && (
        <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">{successMessage}</div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Action buttons — AC #5 */}
      {isReviewable && (
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setPendingAction('DISMISS')}
            className="rounded-md bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => setPendingAction('ESCALATE')}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
          >
            Escalate
          </button>
          <button
            onClick={() => setPendingAction('SUSPEND_PROVIDER')}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            Suspend Provider
          </button>
        </div>
      )}

      {/* Detail grid — AC #9 */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Prescribing Summary */}
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">Prescribing Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Total Prescriptions</dt>
              <dd className="font-medium">{alert.prescribingSummary.totalPrescriptions}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Controlled Substances</dt>
              <dd className="font-medium">{alert.prescribingSummary.controlledSubstanceCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Unique Patients</dt>
              <dd className="font-medium">{alert.prescribingSummary.patientCount}</dd>
            </div>
          </dl>
        </div>

        {/* Flagged Pattern Details */}
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">Flagged Pattern</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Anomaly Type</dt>
              <dd className="font-medium">{ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Threshold</dt>
              <dd className="font-medium">
                {alert.anomalyType === 'CONTROLLED_SUBSTANCE_VOLUME'
                  ? `>${alert.threshold} Rx/day`
                  : `>${alert.threshold}% of patients`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Actual Value</dt>
              <dd className="font-medium text-red-700">
                {alert.anomalyType === 'CONTROLLED_SUBSTANCE_VOLUME'
                  ? `${alert.actualValue} Rx/day`
                  : `${alert.actualValue}% of patients`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Date Range</dt>
              <dd className="font-medium">{formatDate(alert.dateRangeStart)} – {formatDate(alert.dateRangeEnd)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Timeline visualization — AC #9: dates and counts, no patient identifiers */}
      {alert.timeline.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">Prescription Timeline</h2>
          <div className="mt-4 space-y-2">
            {alert.timeline.map((entry) => (
              <div key={entry.date} className="flex items-center gap-3">
                <span className="w-28 text-xs text-neutral-500 shrink-0">{formatDate(entry.date)}</span>
                <div className="flex-1 h-5 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${entry.count > alert.threshold ? 'bg-red-400' : 'bg-blue-400'}`}
                    style={{ width: `${Math.max(4, (entry.count / maxTimelineCount) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-xs font-medium text-neutral-700 text-end">{entry.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review history (if already reviewed) */}
      {alert.reviewAction && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">Review History</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Action Taken</dt>
              <dd className="font-medium">{alert.reviewAction}</dd>
            </div>
            {alert.reviewedAt && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Reviewed At</dt>
                <dd className="font-medium">{formatDateTime(alert.reviewedAt)}</dd>
              </div>
            )}
            {alert.reviewReason && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Reason</dt>
                <dd className="font-medium">{alert.reviewReason}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Confirmation Dialog */}
      {pendingAction && (
        <ReviewDialog
          action={pendingAction}
          onConfirm={handleAction}
          onCancel={() => setPendingAction(null)}
          submitting={submitting}
        />
      )}
    </div>
  )
}

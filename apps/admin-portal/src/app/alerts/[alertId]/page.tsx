'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { EscalationModal } from '@/components/alerts/EscalationModal'
import { EscalationSection } from '@/components/alerts/EscalationSection'

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
  assigneeName: string | null
  escalationPriority: string | null
  escalationNote: string | null
  escalatedByName: string | null
  escalatedAt: string | null
  resolutionNote: string | null
  resolvedByName: string | null
  resolvedAt: string | null
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
    HIGH: 'bg-danger-subtle text-danger',
    MEDIUM: 'bg-warning-subtle text-warning',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${colorMap[severity] ?? 'bg-surface text-text-secondary'}`}>
      {severity}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    UNREVIEWED: 'bg-warning-subtle text-warning',
    ESCALATED: 'bg-purple-100 text-purple-800',
    DISMISSED: 'bg-surface text-text-secondary',
    SUSPENDED: 'bg-danger-subtle text-danger',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
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
      <div className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{c.title}</h2>
        <p className="mt-3 text-sm text-text-primary">{c.description}</p>

        {action === 'SUSPEND_PROVIDER' && (
          <div className="mt-3 rounded-xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">
            Warning: This will immediately terminate the provider&apos;s active sessions and block clinical access.
          </div>
        )}

        <div className="mt-4">
          <label htmlFor="reason" className="block text-sm font-medium text-text-primary">
            Reason <span className="text-danger">*</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Enter a reason for this action (required)..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting || !reason.trim()}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200 ${c.buttonColor}`}
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
  const [showEscalationModal, setShowEscalationModal] = useState(false)

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
    return <div className="text-text-secondary">Loading alert details...</div>
  }

  if (error && !alert) {
    return (
      <div>
        <button onClick={() => router.push('/alerts')} className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Alerts</button>
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      </div>
    )
  }

  if (!alert) return null

  const isUnreviewed = alert.status === 'UNREVIEWED'
  const showEscalationSection = alert.status === 'ESCALATED' || alert.status === 'RESOLVED'
  const maxTimelineCount = Math.max(...alert.timeline.map((t) => t.count), 1)

  return (
    <>
      <TopHeader title={alert.practitionerName} description={`${ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType} — Detected ${formatDate(alert.createdAt)}`} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <button onClick={() => router.push('/alerts')} className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Alerts</button>

        {/* Header badges */}
        <div className="mt-4 flex items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <StatusBadge status={alert.status} />
        </div>

        {/* Provider link */}
        <div className="mt-2">
          <Link href={`/providers/profile/${alert.practitionerId}`} className="text-sm font-medium text-accent hover:underline">
            View provider profile
          </Link>
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="mt-4 rounded-2xl bg-success-subtle border border-success/20 p-3 text-sm text-success">{successMessage}</div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Action buttons — AC #5 */}
        {isUnreviewed && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => setPendingAction('DISMISS')}
              className="rounded-full px-6 py-2.5 text-sm font-semibold bg-neutral-600 text-white hover:bg-neutral-700 hover:scale-[1.02] transition-transform duration-200"
            >
              Dismiss
            </button>
            <button
              onClick={() => setShowEscalationModal(true)}
              className="rounded-full px-6 py-2.5 text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 hover:scale-[1.02] transition-transform duration-200"
            >
              Escalate
            </button>
            <button
              onClick={() => setPendingAction('SUSPEND_PROVIDER')}
              className="rounded-full px-6 py-2.5 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] transition-transform duration-200"
            >
              Suspend Provider
            </button>
          </div>
        )}

        {/* Detail grid — AC #9 */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Prescribing Summary */}
          <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-card">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Prescribing Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Total Prescriptions</dt>
                <dd className="font-medium">{alert.prescribingSummary.totalPrescriptions}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Controlled Substances</dt>
                <dd className="font-medium">{alert.prescribingSummary.controlledSubstanceCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Unique Patients</dt>
                <dd className="font-medium">{alert.prescribingSummary.patientCount}</dd>
              </div>
            </dl>
          </div>

          {/* Flagged Pattern Details */}
          <div className="rounded-2xl border border-border bg-surface-raised p-6 shadow-card">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Flagged Pattern</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Anomaly Type</dt>
                <dd className="font-medium">{ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Threshold</dt>
                <dd className="font-medium">
                  {alert.anomalyType === 'CONTROLLED_SUBSTANCE_VOLUME'
                    ? `>${alert.threshold} Rx/day`
                    : `>${alert.threshold}% of patients`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Actual Value</dt>
                <dd className="font-medium text-danger">
                  {alert.anomalyType === 'CONTROLLED_SUBSTANCE_VOLUME'
                    ? `${alert.actualValue} Rx/day`
                    : `${alert.actualValue}% of patients`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Date Range</dt>
                <dd className="font-medium">{formatDate(alert.dateRangeStart)} – {formatDate(alert.dateRangeEnd)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Escalation section */}
        {showEscalationSection && (
          <div className="mt-6">
            <EscalationSection
              alertId={alert.id}
              status={alert.status}
              assigneeName={alert.assigneeName}
              escalationPriority={alert.escalationPriority}
              escalationNote={alert.escalationNote}
              escalatedByName={alert.escalatedByName}
              escalatedAt={alert.escalatedAt}
              resolutionNote={alert.resolutionNote}
              resolvedByName={alert.resolvedByName}
              resolvedAt={alert.resolvedAt}
              onResolve={fetchDetail}
              onReassign={fetchDetail}
            />
          </div>
        )}

        {/* Timeline visualization — AC #9: dates and counts, no patient identifiers */}
        {alert.timeline.length > 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-surface-raised p-6 shadow-card">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Prescription Timeline</h2>
            <div className="mt-4 space-y-2">
              {alert.timeline.map((entry) => (
                <div key={entry.date} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-text-secondary shrink-0">{formatDate(entry.date)}</span>
                  <div className="flex-1 h-5 bg-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${entry.count > alert.threshold ? 'bg-danger' : 'bg-success'}`}
                      style={{ width: `${Math.max(4, (entry.count / maxTimelineCount) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs font-medium text-text-primary text-end">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review history (if already reviewed) */}
        {alert.reviewAction && (
          <div className="mt-6 rounded-2xl border border-border bg-surface-raised p-6 shadow-card">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Review History</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">Action Taken</dt>
                <dd className="font-medium">{alert.reviewAction}</dd>
              </div>
              {alert.reviewedAt && (
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Reviewed At</dt>
                  <dd className="font-medium">{formatDateTime(alert.reviewedAt)}</dd>
                </div>
              )}
              {alert.reviewReason && (
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Reason</dt>
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

        {/* Escalation Modal */}
        {showEscalationModal && (
          <EscalationModal
            alertId={alertId}
            onClose={() => setShowEscalationModal(false)}
            onSuccess={() => {
              setShowEscalationModal(false)
              fetchDetail()
            }}
          />
        )}
      </div>
    </>
  )
}

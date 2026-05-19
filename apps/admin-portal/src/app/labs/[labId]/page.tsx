'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

type LabAction = 'APPROVE' | 'SUSPEND' | 'REACTIVATE'

interface StatusHistoryEntry {
  status: string
  changedBy: string
  changedByName: string | null
  changedAt: string
  reason: string | null
}

interface LabDetail {
  id: string
  labName: string
  licenseReference: string
  accreditationReference: string | null
  status: string
  registeredAt: string
  technician: {
    id: string
    name: string
    email: string | null
    credentialRef: string
    qualification: string | null
  } | null
  statusHistory: StatusHistoryEntry[]
  uploadCount: number
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING: 'bg-warning-subtle text-warning',
    ACTIVE: 'bg-success-subtle text-success',
    SUSPENDED: 'bg-danger-subtle text-danger',
  }
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${colorMap[status] ?? 'bg-surface text-text-secondary'}`}>
      {status}
    </span>
  )
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** AC #8: Confirmation dialog with optional reason field */
function ConfirmationDialog({
  action,
  labName,
  onConfirm,
  onCancel,
  submitting,
}: {
  action: LabAction
  labName: string
  onConfirm: (reason: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [reason, setReason] = useState('')

  const config: Record<LabAction, { title: string; description: string; buttonLabel: string; buttonColor: string }> = {
    APPROVE: {
      title: 'Approve Lab',
      description: `Approve "${labName}" for active operation? The lab technician will be notified and can begin uploading results.`,
      buttonLabel: 'Approve',
      buttonColor: 'bg-green-600 hover:bg-green-700',
    },
    SUSPEND: {
      title: 'Suspend Lab',
      description: `Suspend "${labName}"? This will immediately block the lab from uploading results. The technician will be notified.`,
      buttonLabel: 'Suspend',
      buttonColor: 'bg-red-600 hover:bg-red-700',
    },
    REACTIVATE: {
      title: 'Reactivate Lab',
      description: `Reactivate "${labName}"? This will restore upload access. The technician will be notified.`,
      buttonLabel: 'Reactivate',
      buttonColor: 'bg-accent',
    },
  }

  const c = config[action]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text-primary">{c.title}</h2>
        <p className="mt-3 text-sm text-text-secondary">{c.description}</p>

        <div className="mt-4">
          <label htmlFor="reason" className="block text-sm font-medium text-text-secondary">
            Reason <span className="text-text-secondary/60">(optional)</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Enter a reason for this action..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-border text-text-primary px-6 py-2.5 text-sm hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200 ${c.buttonColor} ${action === 'REACTIVATE' ? 'text-text-primary' : 'text-white'}`}
          >
            {submitting ? 'Processing...' : c.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LabDetailPage() {
  const params = useParams()
  const router = useRouter()
  const labId = params.labId as string

  const [lab, setLab] = useState<LabDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<LabAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.getLabDetail.query({ labId })
      setLab(result)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load lab details')
    } finally {
      setLoading(false)
    }
  }, [labId])

  useEffect(() => {
    fetchDetail()
  }, [fetchDetail])

  async function handleAction(reason: string) {
    if (!pendingAction || !lab) return
    try {
      setSubmitting(true)
      setError(null)
      const result = await trpc.admin.reviewLab.mutate({
        labId,
        action: pendingAction,
        ...(reason ? { reason } : {}),
      })
      setPendingAction(null)
      setSuccessMessage(`Lab ${pendingAction.toLowerCase()}d successfully. Status: ${result.newStatus}`)
      // Refresh detail view — AC #5
      await fetchDetail()
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (err: any) {
      setError(err?.message ?? `Failed to ${pendingAction.toLowerCase()} lab`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-text-secondary">Loading lab details...</div>
  }

  if (error && !lab) {
    return (
      <div>
        <button onClick={() => router.push('/labs')} className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Labs</button>
        <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
      </div>
    )
  }

  if (!lab) return null

  return (
    <>
      <TopHeader title={lab.labName} description={`Registered ${formatDate(lab.registeredAt)}`} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <button onClick={() => router.push('/labs')} className="text-sm text-text-secondary hover:text-text-primary transition-colors">&larr; Back to Labs</button>

        {/* Header */}
        <div className="mt-4 flex items-center justify-end">
          <StatusBadge status={lab.status} />
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="mt-4 rounded-2xl bg-success-subtle border border-success/20 p-3 text-sm text-success">{successMessage}</div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Action buttons — AC #3, status-dependent */}
        <div className="mt-6 flex gap-3">
          {lab.status === 'PENDING' && (
            <button
              onClick={() => setPendingAction('APPROVE')}
              className="rounded-full px-6 py-2.5 text-sm font-semibold bg-green-600 text-white hover:bg-green-700 hover:scale-[1.02] transition-transform duration-200"
            >
              Approve
            </button>
          )}
          {lab.status === 'ACTIVE' && (
            <button
              onClick={() => setPendingAction('SUSPEND')}
              className="rounded-full px-6 py-2.5 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 hover:scale-[1.02] transition-transform duration-200"
            >
              Suspend
            </button>
          )}
          {lab.status === 'SUSPENDED' && (
            <button
              onClick={() => setPendingAction('REACTIVATE')}
              className="rounded-full px-6 py-2.5 text-sm font-semibold bg-accent text-text-primary hover:scale-[1.02] transition-transform duration-200"
            >
              Reactivate
            </button>
          )}
        </div>

        {/* Lab details grid — AC #9 */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Registration Documents */}
          <div className="rounded-2xl bg-surface-raised p-6 border border-border shadow-card">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Registration Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-text-secondary">License Reference</dt>
                <dd className="font-medium text-text-primary">{lab.licenseReference}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Accreditation (ISO 15189)</dt>
                <dd className="font-medium text-text-primary">{lab.accreditationReference ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-secondary">Upload History</dt>
                <dd className="font-medium text-text-primary">{lab.uploadCount} result{lab.uploadCount !== 1 ? 's' : ''}</dd>
              </div>
            </dl>
          </div>

          {/* Technician Credentials */}
          <div className="rounded-2xl bg-surface-raised p-6 border border-border shadow-card">
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Technician</h2>
            {lab.technician ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Name</dt>
                  <dd className="font-medium text-text-primary">{lab.technician.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Email</dt>
                  <dd className="font-medium text-text-primary">{lab.technician.email ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Credential Ref</dt>
                  <dd className="font-medium text-text-primary">{lab.technician.credentialRef}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-secondary">Qualification</dt>
                  <dd className="font-medium text-text-primary">{lab.technician.qualification ?? '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-text-secondary">No technician associated.</p>
            )}
          </div>
        </div>

        {/* Status Transition History — AC #9 */}
        <div className="mt-6 rounded-2xl bg-surface-raised p-6 border border-border shadow-card">
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Status History</h2>
          {lab.statusHistory.length === 0 ? (
            <p className="mt-3 text-sm text-text-secondary">No status transitions recorded.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {lab.statusHistory.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 border-s-2 border-border ps-4 py-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={entry.status} />
                      {entry.changedByName && (
                        <span className="text-xs font-medium text-text-primary">{entry.changedByName}</span>
                      )}
                      <span className="text-xs text-text-secondary">{formatDateTime(entry.changedAt)}</span>
                    </div>
                    {entry.reason && (
                      <p className="mt-1 text-sm text-text-secondary">{entry.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirmation Dialog — AC #8 */}
        {pendingAction && (
          <ConfirmationDialog
            action={pendingAction}
            labName={lab.labName}
            onConfirm={handleAction}
            onCancel={() => setPendingAction(null)}
            submitting={submitting}
          />
        )}
      </div>
    </>
  )
}

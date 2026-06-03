'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  const variantMap: Record<string, 'warning' | 'success' | 'destructive'> = {
    PENDING: 'warning',
    ACTIVE: 'success',
    SUSPENDED: 'destructive',
  }
  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status}
    </Badge>
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

  const variantMap: Record<LabAction, 'success' | 'destructive' | 'default'> = {
    APPROVE: 'success',
    SUSPEND: 'destructive',
    REACTIVATE: 'default',
  }

  const config: Record<LabAction, { title: string; description: string; buttonLabel: string }> = {
    APPROVE: {
      title: 'Approve Lab',
      description: `Approve "${labName}" for active operation? The lab technician will be notified and can begin uploading results.`,
      buttonLabel: 'Approve',
    },
    SUSPEND: {
      title: 'Suspend Lab',
      description: `Suspend "${labName}"? This will immediately block the lab from uploading results. The technician will be notified.`,
      buttonLabel: 'Suspend',
    },
    REACTIVATE: {
      title: 'Reactivate Lab',
      description: `Reactivate "${labName}"? This will restore upload access. The technician will be notified.`,
      buttonLabel: 'Reactivate',
    },
  }

  const c = config[action]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-popover p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">{c.title}</h2>
        <p className="mt-3 text-sm text-muted-foreground">{c.description}</p>

        <div className="mt-4">
          <label htmlFor="reason" className="block text-sm font-medium text-muted-foreground">
            Reason <span className="text-muted-foreground/60">(optional)</span>
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Enter a reason for this action..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={variantMap[action]}
            onClick={() => onConfirm(reason)}
            disabled={submitting}
          >
            {submitting ? 'Processing...' : c.buttonLabel}
          </Button>
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
    return <div className="text-muted-foreground">Loading lab details...</div>
  }

  if (error && !lab) {
    return (
      <div>
        <Button variant="ghost" onClick={() => router.push('/labs')}>&larr; Back to Labs</Button>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!lab) return null

  return (
    <>
      <TopHeader title={lab.labName} description={`Registered ${formatDate(lab.registeredAt)}`} />
      <div className="mx-auto max-w-7xl px-8 py-6">
        <Button variant="ghost" onClick={() => router.push('/labs')}>&larr; Back to Labs</Button>

        {/* Header */}
        <div className="mt-4 flex items-center justify-end">
          <StatusBadge status={lab.status} />
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="mt-4 rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">{successMessage}</div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Action buttons — AC #3, status-dependent + Story 55.1 AC #6: Staff link */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push(`/labs/${labId}/staff`)}
          >
            View Staff
          </Button>
          {lab.status === 'PENDING' && (
            <Button
              variant="success"
              onClick={() => setPendingAction('APPROVE')}
            >
              Approve
            </Button>
          )}
          {lab.status === 'ACTIVE' && (
            <Button
              variant="destructive"
              onClick={() => setPendingAction('SUSPEND')}
            >
              Suspend
            </Button>
          )}
          {lab.status === 'SUSPENDED' && (
            <Button
              onClick={() => setPendingAction('REACTIVATE')}
            >
              Reactivate
            </Button>
          )}
        </div>

        {/* Lab details grid — AC #9 */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Registration Documents */}
          <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Registration Details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">License Reference</dt>
                <dd className="font-medium text-foreground">{lab.licenseReference}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Accreditation (ISO 15189)</dt>
                <dd className="font-medium text-foreground">{lab.accreditationReference ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Upload History</dt>
                <dd className="font-medium text-foreground">{lab.uploadCount} result{lab.uploadCount !== 1 ? 's' : ''}</dd>
              </div>
            </dl>
          </div>

          {/* Technician Credentials */}
          <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Technician</h2>
            {lab.technician ? (
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium text-foreground">{lab.technician.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="font-medium text-foreground">{lab.technician.email ?? '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Credential Ref</dt>
                  <dd className="font-medium text-foreground">{lab.technician.credentialRef}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Qualification</dt>
                  <dd className="font-medium text-foreground">{lab.technician.qualification ?? '—'}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No technician associated.</p>
            )}
          </div>
        </div>

        {/* Status Transition History — AC #9 */}
        <div className="mt-6 rounded-2xl bg-popover p-6 border border-border shadow-card">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Status History</h2>
          {lab.statusHistory.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No status transitions recorded.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {lab.statusHistory.map((entry, i) => (
                <div key={i} className="flex items-start gap-3 border-s-2 border-border ps-4 py-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={entry.status} />
                      {entry.changedByName && (
                        <span className="text-xs font-medium text-foreground">{entry.changedByName}</span>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDateTime(entry.changedAt)}</span>
                    </div>
                    {entry.reason && (
                      <p className="mt-1 text-sm text-muted-foreground">{entry.reason}</p>
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

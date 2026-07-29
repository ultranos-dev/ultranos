'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { EscalationModal } from '@/components/alerts/EscalationModal'
import { EscalationSection } from '@/components/alerts/EscalationSection'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
  const variantMap: Record<string, 'destructive' | 'warning' | 'secondary'> = {
    HIGH: 'destructive',
    MEDIUM: 'warning',
  }
  return (
    <Badge variant={variantMap[severity] ?? 'secondary'}>
      {severity}
    </Badge>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'warning' | 'secondary' | 'destructive'> = {
    UNREVIEWED: 'warning',
    ESCALATED: 'secondary',
    DISMISSED: 'secondary',
    SUSPENDED: 'destructive',
  }
  return (
    <Badge variant={variantMap[status] ?? 'secondary'}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
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
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: {
  action: ReviewAction
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  submitting: boolean
}) {
  const [reason, setReason] = useState('')
  const t = useTranslations('alerts')

  const config: Record<ReviewAction, { title: string; description: string; buttonLabel: string; buttonVariant: 'secondary' | 'destructive' }> = {
    DISMISS: {
      title: t('detailConfirmDismissTitle'),
      description: t('detailConfirmDismissDesc'),
      buttonLabel: t('detailDismiss'),
      buttonVariant: 'secondary',
    },
    ESCALATE: {
      title: t('detailConfirmEscalateTitle'),
      description: t('detailConfirmEscalateDesc'),
      buttonLabel: t('detailEscalate'),
      buttonVariant: 'secondary',
    },
    SUSPEND_PROVIDER: {
      title: t('detailConfirmSuspendTitle'),
      description: t('detailConfirmSuspendDesc'),
      buttonLabel: t('detailSuspendProvider'),
      buttonVariant: 'destructive',
    },
  }

  const c = config[action]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.description}</DialogDescription>
        </DialogHeader>

        {action === 'SUSPEND_PROVIDER' && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            Warning: This will immediately terminate the provider&apos;s active sessions and block clinical access.
          </div>
        )}

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-foreground">
            Reason <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1"
            placeholder="Enter a reason for this action (required)..."
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={c.buttonVariant}
            onClick={() => onConfirm(reason)}
            disabled={submitting || !reason.trim()}
          >
            {submitting ? 'Processing...' : c.buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AlertDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('alerts')
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
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to load alert details')
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
      setSuccessMessage(t('detailActionSuccess'))
      setTimeout(() => {
        router.push('/alerts')
      }, 1500)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t('detailLoading')}</div>
  }

  if (error && !alert) {
    return (
      <div>
        <Button variant="ghost" size="sm" className="w-fit px-0" onClick={() => router.push('/alerts')}>{t('detailBackToAlerts')}</Button>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!alert) return null

  const isUnreviewed = alert.status === 'UNREVIEWED'
  const showEscalationSection = alert.status === 'ESCALATED' || alert.status === 'RESOLVED'
  const maxTimelineCount = Math.max(...alert.timeline.map((t) => t.count), 1)

  return (
    <div className="flex flex-col gap-4">
        <Button variant="ghost" size="sm" className="w-fit px-0" onClick={() => router.push('/alerts')}>{t('detailBackToAlerts')}</Button>

        <h1 className="text-2xl font-semibold text-foreground">{ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType}</h1>

        {/* Header badges */}
        <div className="flex items-center gap-2">
          <SeverityBadge severity={alert.severity} />
          <StatusBadge status={alert.status} />
        </div>

        {/* Provider link */}
        <div>
          <Link href={`/providers/profile/${alert.practitionerId}`} className="text-sm font-medium text-primary hover:underline">
            {t('detailViewProfile')}
          </Link>
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">{successMessage}</div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Action buttons — AC #5 */}
        {isUnreviewed && (
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setPendingAction('DISMISS')}>
              {t('detailDismiss')}
            </Button>
            <Button variant="secondary" onClick={() => setShowEscalationModal(true)}>
              {t('detailEscalate')}
            </Button>
            <Button variant="destructive" onClick={() => setPendingAction('SUSPEND_PROVIDER')}>
              {t('detailSuspendProvider')}
            </Button>
          </div>
        )}

        {/* Detail grid — AC #9 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Prescribing Summary */}
          <div className="rounded-xl bg-card p-6 shadow-card ring-[0.65px] ring-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailPrescribingSummary')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Total Prescriptions</dt>
                <dd className="font-medium">{alert.prescribingSummary.totalPrescriptions}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Controlled Substances</dt>
                <dd className="font-medium">{alert.prescribingSummary.controlledSubstanceCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Unique Patients</dt>
                <dd className="font-medium">{alert.prescribingSummary.patientCount}</dd>
              </div>
            </dl>
          </div>

          {/* Flagged Pattern Details */}
          <div className="rounded-xl bg-card p-6 shadow-card ring-[0.65px] ring-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailFlaggedPattern')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Anomaly Type</dt>
                <dd className="font-medium">{ANOMALY_TYPE_LABELS[alert.anomalyType] ?? alert.anomalyType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Threshold</dt>
                <dd className="font-medium">
                  {alert.anomalyType === 'CONTROLLED_SUBSTANCE_VOLUME'
                    ? `>${alert.threshold} Rx/day`
                    : `>${alert.threshold}% of patients`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Actual Value</dt>
                <dd className="font-medium text-destructive">
                  {alert.anomalyType === 'CONTROLLED_SUBSTANCE_VOLUME'
                    ? `${alert.actualValue} Rx/day`
                    : `${alert.actualValue}% of patients`}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Date Range</dt>
                <dd className="font-medium">{formatDate(alert.dateRangeStart)} – {formatDate(alert.dateRangeEnd)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Escalation section */}
        {showEscalationSection && (
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
        )}

        {/* Timeline visualization — AC #9: dates and counts, no patient identifiers */}
        {alert.timeline.length > 0 && (
          <div className="rounded-xl bg-card p-6 shadow-card ring-[0.65px] ring-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailPrescriptionTimeline')}</h2>
            <div className="mt-4 space-y-2">
              {alert.timeline.map((entry) => (
                <div key={entry.date} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-muted-foreground shrink-0">{formatDate(entry.date)}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${entry.count > alert.threshold ? 'bg-destructive' : 'bg-success'}`}
                      style={{ width: `${Math.max(4, (entry.count / maxTimelineCount) * 100)}%` }}
                    />
                  </div>
                  <span className="w-8 text-xs font-medium text-foreground text-end">{entry.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Review history (if already reviewed) */}
        {alert.reviewAction && (
          <div className="rounded-xl bg-card p-6 shadow-card ring-[0.65px] ring-border/50">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailReviewHistory')}</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Action Taken</dt>
                <dd className="font-medium">{alert.reviewAction}</dd>
              </div>
              {alert.reviewedAt && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Reviewed At</dt>
                  <dd className="font-medium">{formatDateTime(alert.reviewedAt)}</dd>
                </div>
              )}
              {alert.reviewReason && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Reason</dt>
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
            open={!!pendingAction}
            onOpenChange={(open) => { if (!open) setPendingAction(null) }}
            onConfirm={handleAction}
            submitting={submitting}
          />
        )}

        {/* Escalation Modal */}
        <EscalationModal
          alertId={alertId}
          open={showEscalationModal}
          onOpenChange={setShowEscalationModal}
          onSuccess={() => {
            setShowEscalationModal(false)
            fetchDetail()
          }}
        />
      </div>
  )
}

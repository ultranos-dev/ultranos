'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
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

type KycAction = 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO'

interface OcrField {
  name: string
  value: string
  confidence: number
}

interface DocumentUrl {
  type: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
  url: string
}

interface OcrSection {
  documentType: 'MEDICAL_LICENSE' | 'NATIONAL_ID'
  fields: OcrField[]
}

interface SubmissionDetail {
  submission: {
    id: string
    practitionerId: string
    submittedAt: string
    status: string
    registryNumber: string
    rejectionReason: string | null
    adminMessage: string | null
    reviewedBy: string | null
    reviewedAt: string | null
  }
  providerName: string
  kycStatus: string
  documentUrls: DocumentUrl[]
  ocrFields: OcrSection[]
  slaDeadline: string
  slaBreached: boolean
  slaRemainingHours: number | null
}

const kycVariantMap: Record<string, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  PENDING_VERIFICATION: 'warning',
  ACTIVE: 'success',
  REJECTED: 'destructive',
  REQUEST_MORE_INFO: 'warning',
}

const kycLabelMap: Record<string, string> = {
  PENDING_VERIFICATION: 'Pending Verification',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  REQUEST_MORE_INFO: 'More Info Requested',
}

function KycStatusBadge({ status }: { status: string }) {
  return (
    <Badge size="lg" variant={kycVariantMap[status] ?? 'secondary'}>
      {kycLabelMap[status] ?? status}
    </Badge>
  )
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.85 ? 'text-success' : confidence >= 0.6 ? 'text-warning' : 'text-destructive'
  return <span className={`text-xs font-medium ${color}`}>{pct}%</span>
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const DOC_TYPE_LABELS: Record<string, string> = {
  MEDICAL_LICENSE: 'Medical License',
  NATIONAL_ID: 'National ID',
}

/** AC #4: Confirmation dialog with required reason for reject */
function ConfirmationDialog({
  action,
  providerName,
  open,
  onOpenChange,
  onConfirm,
  submitting,
}: {
  action: KycAction
  providerName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  submitting: boolean
}) {
  const [reason, setReason] = useState('')
  const t = useTranslations('providers')

  const actionVariantMap: Record<KycAction, 'success' | 'destructive' | 'outline'> = {
    APPROVE: 'success',
    REJECT: 'destructive',
    REQUEST_MORE_INFO: 'outline',
  }

  const config: Record<KycAction, {
    title: string; description: string; buttonLabel: string; reasonRequired: boolean; reasonLabel: string
  }> = {
    APPROVE: {
      title: t('detailConfirmApproveTitle'),
      description: `${t('detailConfirmApproveDesc')} "${providerName}"`,
      buttonLabel: t('detailApprove'),
      reasonRequired: false,
      reasonLabel: t('detailReason'),
    },
    REJECT: {
      title: t('detailConfirmRejectTitle'),
      description: `${t('detailConfirmRejectDesc')} "${providerName}"`,
      buttonLabel: t('detailReject'),
      reasonRequired: true,
      reasonLabel: t('detailReason'),
    },
    REQUEST_MORE_INFO: {
      title: t('detailConfirmRequestTitle'),
      description: `${t('detailConfirmRequestDesc')} "${providerName}"`,
      buttonLabel: t('detailRequestInfo'),
      reasonRequired: false,
      reasonLabel: t('detailReason'),
    },
  }

  const c = config[action]
  const canSubmit = !c.reasonRequired || reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.description}</DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="reason" className="block text-sm font-medium text-muted-foreground">
            {c.reasonLabel}
          </label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1"
            placeholder={c.reasonRequired ? 'Enter the reason for rejection...' : 'Enter a message...'}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant={actionVariantMap[action]}
            onClick={() => onConfirm(reason)}
            disabled={submitting || !canSubmit}
          >
            {submitting ? 'Processing...' : c.buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function KycSubmissionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useTranslations('providers')
  const submissionId = params.submissionId as string

  const [detail, setDetail] = useState<SubmissionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<KycAction | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.getKycSubmission.query({ submissionId })
      setDetail(result)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailLoading'))
    } finally {
      setLoading(false)
    }
  }, [submissionId])

  useEffect(() => {
    fetchDetail()
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current)
    }
  }, [fetchDetail])

  async function handleAction(reason: string) {
    if (!pendingAction || !detail) return
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.reviewKycSubmission.mutate({
        submissionId,
        action: pendingAction,
        ...(reason ? { reason } : {}),
      })
      setPendingAction(null)
      setSuccessMessage(t('detailActionSuccess'))
      // Redirect back to queue after short delay — AC #5
      redirectTimerRef.current = setTimeout(() => router.push('/providers'), 2000)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? t('detailActionError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">{t('detailLoading')}</div>
  }

  if (error && !detail) {
    return (
      <div>
        <Button variant="ghost" onClick={() => router.push('/providers')}>{t('detailBackToQueue')}</Button>
        <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      </div>
    )
  }

  if (!detail) return null

  const isPending = detail.submission.status === 'PENDING'

  return (
    <div className="flex flex-col gap-4">
        <Button variant="ghost" onClick={() => router.push('/providers')}>{t('detailBackToQueue')}</Button>

        {/* Header */}
        <div className="mt-4 flex items-center justify-between">
          <div>
            {detail.slaBreached && (
              <Badge variant="destructive">SLA Breached</Badge>
            )}
          </div>
          <KycStatusBadge status={detail.kycStatus} />
        </div>

        {/* Success toast */}
        {successMessage && (
          <div className="mt-4 rounded-2xl bg-success/10 border border-success/20 p-3 text-sm text-success">{successMessage}</div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Action buttons — AC #4 */}
        {isPending && (
          <div className="mt-6 flex gap-3">
            <Button
              variant="success"
              onClick={() => setPendingAction('APPROVE')}
            >
              {t('detailApprove')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setPendingAction('REJECT')}
            >
              {t('detailReject')}
            </Button>
            <Button
              variant="outline"
              onClick={() => setPendingAction('REQUEST_MORE_INFO')}
            >
              {t('detailRequestInfo')}
            </Button>
          </div>
        )}

        {/* Side-by-side: Document viewer + OCR fields — AC #3 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Left panel: Document viewer */}
          <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailDocuments')}</h2>
            {detail.documentUrls.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No documents available.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {detail.documentUrls.map((doc) => (
                  <div key={doc.type}>
                    <p className="text-sm font-medium text-foreground mb-2">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
                    {doc.url ? (
                      doc.url.endsWith('.pdf') ? (
                        <iframe
                          src={doc.url}
                          title={`${doc.type} document`}
                          className="w-full h-64 rounded border border-border"
                        />
                      ) : (
                        <img
                          src={doc.url}
                          alt={`${DOC_TYPE_LABELS[doc.type]} document`}
                          className="w-full rounded border border-border object-contain max-h-80"
                        />
                      )
                    ) : (
                      <p className="text-sm text-muted-foreground">Document URL unavailable</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: OCR-extracted fields — AC #3 */}
          <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailOcrFields')}</h2>
            {detail.ocrFields.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No OCR data available.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {detail.ocrFields.map((section) => (
                  <div key={section.documentType}>
                    <p className="text-sm font-medium text-foreground mb-2">{DOC_TYPE_LABELS[section.documentType] ?? section.documentType}</p>
                    {section.fields.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No fields extracted.</p>
                    ) : (
                      <dl className="space-y-2">
                        {section.fields.map((field, i) => (
                          <div key={i} className="flex items-center justify-between rounded-xl bg-card px-3 py-2">
                            <div>
                              <dt className="text-xs text-muted-foreground">{field.name}</dt>
                              <dd className="text-sm font-medium">{field.value}</dd>
                            </div>
                            <ConfidenceIndicator confidence={field.confidence} />
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submission metadata */}
        <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('detailSubmissionInfo')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Registry Number</dt>
              <dd className="font-medium">{detail.submission.registryNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Submission Status</dt>
              <dd className="font-medium">{detail.submission.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">SLA Deadline</dt>
              <dd className={`font-medium ${detail.slaBreached ? 'text-destructive' : ''}`}>
                {formatDateTime(detail.slaDeadline)}
              </dd>
            </div>
            {detail.submission.reviewedBy && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reviewed By</dt>
                <dd className="font-medium">{detail.submission.reviewedBy}</dd>
              </div>
            )}
            {detail.submission.reviewedAt && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Reviewed At</dt>
                <dd className="font-medium">{formatDateTime(detail.submission.reviewedAt)}</dd>
              </div>
            )}
            {detail.submission.rejectionReason && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Rejection Reason</dt>
                <dd className="font-medium text-destructive">{detail.submission.rejectionReason}</dd>
              </div>
            )}
            {detail.submission.adminMessage && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Admin Message</dt>
                <dd className="font-medium">{detail.submission.adminMessage}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Confirmation Dialog — AC #4 */}
        {pendingAction && (
          <ConfirmationDialog
            key={pendingAction}
            action={pendingAction}
            providerName={detail.providerName}
            open={!!pendingAction}
            onOpenChange={(open) => { if (!open) setPendingAction(null) }}
            onConfirm={handleAction}
            submitting={submitting}
          />
        )}
      </div>
  )
}

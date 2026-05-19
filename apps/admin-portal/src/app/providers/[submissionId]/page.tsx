'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc'

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

function KycStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING_VERIFICATION: 'bg-amber-100 text-amber-800',
    ACTIVE: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    REQUEST_MORE_INFO: 'bg-amber-100 text-amber-800',
  }

  const labelMap: Record<string, string> = {
    PENDING_VERIFICATION: 'Pending Verification',
    ACTIVE: 'Active',
    REJECTED: 'Rejected',
    REQUEST_MORE_INFO: 'More Info Requested',
  }

  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${colorMap[status] ?? 'bg-neutral-100 text-neutral-600'}`}>
      {labelMap[status] ?? status}
    </span>
  )
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.85 ? 'text-green-600' : confidence >= 0.6 ? 'text-amber-600' : 'text-red-600'
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
  onConfirm,
  onCancel,
  submitting,
}: {
  action: KycAction
  providerName: string
  onConfirm: (reason: string) => void
  onCancel: () => void
  submitting: boolean
}) {
  const [reason, setReason] = useState('')

  const config: Record<KycAction, {
    title: string; description: string; buttonLabel: string; buttonColor: string; reasonRequired: boolean; reasonLabel: string
  }> = {
    APPROVE: {
      title: 'Approve Provider',
      description: `Approve "${providerName}"? The provider will be notified and can begin using the platform.`,
      buttonLabel: 'Approve',
      buttonColor: 'bg-green-600 hover:bg-green-700',
      reasonRequired: false,
      reasonLabel: 'Notes (optional)',
    },
    REJECT: {
      title: 'Reject Provider',
      description: `Reject "${providerName}"? The provider will be notified with the rejection reason.`,
      buttonLabel: 'Reject',
      buttonColor: 'bg-red-600 hover:bg-red-700',
      reasonRequired: true,
      reasonLabel: 'Rejection reason (required)',
    },
    REQUEST_MORE_INFO: {
      title: 'Request More Information',
      description: `Request additional information from "${providerName}"? The provider will be notified.`,
      buttonLabel: 'Request Info',
      buttonColor: 'bg-amber-600 hover:bg-amber-700',
      reasonRequired: false,
      reasonLabel: 'Message to provider (optional)',
    },
  }

  const c = config[action]
  const canSubmit = !c.reasonRequired || reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{c.title}</h2>
        <p className="mt-3 text-sm text-neutral-700">{c.description}</p>

        <div className="mt-4">
          <label htmlFor="reason" className="block text-sm font-medium text-text-muted">
            {c.reasonLabel}
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
            placeholder={c.reasonRequired ? 'Enter the reason for rejection...' : 'Enter a message...'}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-full border border-black px-6 py-2.5 text-sm font-medium text-black hover:bg-neutral-50 hover:scale-[1.02] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={submitting || !canSubmit}
            className={`rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:scale-[1.02] transition-all ${c.buttonColor}`}
          >
            {submitting ? 'Processing...' : c.buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function KycSubmissionDetailPage() {
  const params = useParams()
  const router = useRouter()
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load submission details')
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
      setSuccessMessage(`Provider ${pendingAction === 'APPROVE' ? 'approved' : pendingAction === 'REJECT' ? 'rejected' : 'info requested'} successfully.`)
      // Redirect back to queue after short delay — AC #5
      redirectTimerRef.current = setTimeout(() => router.push('/providers'), 2000)
    } catch (err: any) {
      setError(err?.message ?? `Failed to ${pendingAction.toLowerCase()} submission`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-neutral-500">Loading submission details...</div>
  }

  if (error && !detail) {
    return (
      <div>
        <button onClick={() => router.push('/providers')} className="text-sm text-text-muted hover:text-black transition-colors">&larr; Back to KYC Queue</button>
        <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      </div>
    )
  }

  if (!detail) return null

  const isPending = detail.submission.status === 'PENDING'

  return (
    <div className="max-w-6xl">
      <button onClick={() => router.push('/providers')} className="text-sm text-text-muted hover:text-black transition-colors">&larr; Back to KYC Queue</button>

      {/* Header */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{detail.providerName}</h1>
          <p className="mt-1 text-text-muted">
            Submitted {formatDateTime(detail.submission.submittedAt)}
            {detail.slaBreached && (
              <span className="ms-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">SLA Breached</span>
            )}
          </p>
        </div>
        <KycStatusBadge status={detail.kycStatus} />
      </div>

      {/* Success toast */}
      {successMessage && (
        <div className="mt-4 rounded-2xl bg-green-50 border border-green-200 p-3 text-sm text-green-800">{successMessage}</div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Action buttons — AC #4 */}
      {isPending && (
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setPendingAction('APPROVE')}
            className="rounded-full bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 hover:scale-[1.02] transition-all"
          >
            Approve
          </button>
          <button
            onClick={() => setPendingAction('REJECT')}
            className="rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 hover:scale-[1.02] transition-all"
          >
            Reject
          </button>
          <button
            onClick={() => setPendingAction('REQUEST_MORE_INFO')}
            className="rounded-full bg-amber-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 hover:scale-[1.02] transition-all"
          >
            Request More Info
          </button>
        </div>
      )}

      {/* Side-by-side: Document viewer + OCR fields — AC #3 */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left panel: Document viewer */}
        <div className="rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Submitted Documents</h2>
          {detail.documentUrls.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No documents available.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {detail.documentUrls.map((doc) => (
                <div key={doc.type}>
                  <p className="text-sm font-medium text-neutral-700 mb-2">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
                  {doc.url ? (
                    doc.url.endsWith('.pdf') ? (
                      <iframe
                        src={doc.url}
                        title={`${doc.type} document`}
                        className="w-full h-64 rounded border border-neutral-200"
                      />
                    ) : (
                      <img
                        src={doc.url}
                        alt={`${DOC_TYPE_LABELS[doc.type]} document`}
                        className="w-full rounded border border-neutral-200 object-contain max-h-80"
                      />
                    )
                  ) : (
                    <p className="text-sm text-neutral-400">Document URL unavailable</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: OCR-extracted fields — AC #3 */}
        <div className="rounded-3xl bg-white p-5 border border-border">
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide">OCR-Extracted Fields</h2>
          {detail.ocrFields.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No OCR data available.</p>
          ) : (
            <div className="mt-3 space-y-6">
              {detail.ocrFields.map((section) => (
                <div key={section.documentType}>
                  <p className="text-sm font-medium text-neutral-700 mb-2">{DOC_TYPE_LABELS[section.documentType] ?? section.documentType}</p>
                  {section.fields.length === 0 ? (
                    <p className="text-sm text-neutral-400">No fields extracted.</p>
                  ) : (
                    <dl className="space-y-2">
                      {section.fields.map((field, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl bg-surface px-3 py-2">
                          <div>
                            <dt className="text-xs text-neutral-500">{field.name}</dt>
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
      <div className="mt-6 rounded-3xl bg-white p-5 border border-border">
        <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Submission Details</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">Registry Number</dt>
            <dd className="font-medium">{detail.submission.registryNumber}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Submission Status</dt>
            <dd className="font-medium">{detail.submission.status}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">SLA Deadline</dt>
            <dd className={`font-medium ${detail.slaBreached ? 'text-red-600' : ''}`}>
              {formatDateTime(detail.slaDeadline)}
            </dd>
          </div>
          {detail.submission.reviewedBy && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Reviewed By</dt>
              <dd className="font-medium">{detail.submission.reviewedBy}</dd>
            </div>
          )}
          {detail.submission.reviewedAt && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Reviewed At</dt>
              <dd className="font-medium">{formatDateTime(detail.submission.reviewedAt)}</dd>
            </div>
          )}
          {detail.submission.rejectionReason && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Rejection Reason</dt>
              <dd className="font-medium text-red-600">{detail.submission.rejectionReason}</dd>
            </div>
          )}
          {detail.submission.adminMessage && (
            <div className="flex justify-between">
              <dt className="text-text-muted">Admin Message</dt>
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
          onConfirm={handleAction}
          onCancel={() => setPendingAction(null)}
          submitting={submitting}
        />
      )}
    </div>
  )
}

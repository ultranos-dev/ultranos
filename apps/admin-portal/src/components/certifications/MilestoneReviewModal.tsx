'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'

interface MilestoneInfo {
  progressId: string
  title: string
  type: string
  evidenceRef: string | null
  submittedAt: string | null
}

interface Props {
  milestone: MilestoneInfo
  onClose: () => void
  onReviewed: () => void
}

function formatType(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function MilestoneReviewModal({ milestone, onClose, onReviewed }: Props) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'APPROVE' | 'REJECT' | null>(null)

  async function handleReview(action: 'APPROVE' | 'REJECT') {
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.reviewMilestone.mutate({
        progressId: milestone.progressId,
        action,
        note: note.trim() || undefined,
      })
      onReviewed()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to review milestone')
    } finally {
      setSubmitting(false)
      setConfirmAction(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-popover p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground mb-4">Review Milestone</h2>

        {/* Milestone details */}
        <div className="space-y-2 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Title</span>
            <span className="font-medium text-foreground">{milestone.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="text-foreground">{formatType(milestone.type)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Evidence Reference</span>
            <span className="text-foreground">{milestone.evidenceRef ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Submitted</span>
            <span className="text-foreground">{formatDate(milestone.submittedAt)}</span>
          </div>
        </div>

        {/* Note */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-muted-foreground mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            placeholder="Add a review note..."
          />
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Confirmation dialog */}
        {confirmAction && (
          <div className="mb-4 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-foreground font-medium">
              Are you sure you want to {confirmAction === 'APPROVE' ? 'approve' : 'reject'} this milestone?
            </p>
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => handleReview(confirmAction)}
                disabled={submitting}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  confirmAction === 'APPROVE'
                    ? 'bg-success text-white hover:bg-success/90'
                    : 'bg-destructive text-white hover:bg-destructive/90'
                }`}
              >
                {submitting ? 'Processing...' : `Confirm ${confirmAction === 'APPROVE' ? 'Approval' : 'Rejection'}`}
              </button>
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:bg-card transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!confirmAction && (
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground hover:bg-card transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => setConfirmAction('REJECT')}
              className="rounded-full bg-destructive px-5 py-2 text-sm font-medium text-white hover:bg-destructive/90 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => setConfirmAction('APPROVE')}
              className="rounded-full bg-success px-5 py-2 text-sm font-medium text-white hover:bg-success/90 transition-colors"
            >
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

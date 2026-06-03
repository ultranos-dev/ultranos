'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

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
              <Button
                variant={confirmAction === 'APPROVE' ? 'success' : 'destructive'}
                size="sm"
                onClick={() => handleReview(confirmAction)}
                disabled={submitting}
              >
                {submitting ? 'Processing...' : `Confirm ${confirmAction === 'APPROVE' ? 'Approval' : 'Rejection'}`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!confirmAction && (
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button variant="destructive" onClick={() => setConfirmAction('REJECT')}>
              Reject
            </Button>
            <Button variant="success" onClick={() => setConfirmAction('APPROVE')}>
              Approve
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

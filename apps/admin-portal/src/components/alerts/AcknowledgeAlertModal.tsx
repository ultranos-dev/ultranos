'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'

interface AcknowledgeAlertModalProps {
  alertId: string
  labName: string
  testCategory: string
  onClose: () => void
  onSuccess: () => void
}

export function AcknowledgeAlertModal({
  alertId,
  labName,
  testCategory,
  onClose,
  onSuccess,
}: AcknowledgeAlertModalProps) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.acknowledgeSurveillanceAlert.mutate({
        alertId,
        notes: notes.trim() || undefined,
      })
      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to acknowledge alert')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-surface-raised p-6 mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text-primary">Acknowledge Alert</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {testCategory} alert for <span className="font-medium">{labName}</span>
        </p>

        {error && (
          <div className="mt-3 rounded-xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">{error}</div>
        )}

        <div className="mt-4">
          <label htmlFor="ack-notes" className="block text-sm font-medium text-text-primary">
            Notes <span className="text-text-secondary">(optional)</span>
          </label>
          <textarea
            id="ack-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Add any notes about this acknowledgment..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-full bg-brand-lime px-6 py-2.5 text-sm font-semibold text-brand-lime-contrast disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
          >
            {submitting ? 'Acknowledging...' : 'Acknowledge'}
          </button>
        </div>
      </div>
    </div>
  )
}

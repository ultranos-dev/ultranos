'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

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
      <div className="w-full max-w-lg rounded-3xl bg-popover p-6 mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-foreground">Acknowledge Alert</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {testCategory} alert for <span className="font-medium">{labName}</span>
        </p>

        {error && (
          <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="mt-4">
          <label htmlFor="ack-notes" className="block text-sm font-medium text-foreground">
            Notes <span className="text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="ack-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="Add any notes about this acknowledgment..."
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Acknowledging...' : 'Acknowledge'}
          </Button>
        </div>
      </div>
    </div>
  )
}

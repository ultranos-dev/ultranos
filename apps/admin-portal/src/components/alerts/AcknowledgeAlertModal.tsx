'use client'

import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface AcknowledgeAlertModalProps {
  alertId: string
  labName: string
  testCategory: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AcknowledgeAlertModal({
  alertId,
  labName,
  testCategory,
  open,
  onOpenChange,
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
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to acknowledge alert')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acknowledge Alert</DialogTitle>
          <DialogDescription>
            {testCategory} alert for <span className="font-medium">{labName}</span>
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        <div>
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Acknowledging...' : 'Acknowledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

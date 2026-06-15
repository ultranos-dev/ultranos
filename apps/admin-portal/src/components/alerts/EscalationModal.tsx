'use client'

import { useState, useEffect } from 'react'
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

interface AdminUser {
  id: string
  name: string
}

interface EscalationModalProps {
  alertId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function EscalationModal({ alertId, open, onOpenChange, onSuccess }: EscalationModalProps) {
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [priority, setPriority] = useState<'URGENT' | 'NORMAL'>('NORMAL')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadAdmins() {
      try {
        const result = await trpc.admin.listUsers.query({
          cursor: 0,
          limit: 50,
          role: 'ADMIN',
          status: 'ACTIVE',
        })
        setAdminUsers(
          result.users.map((u: { id: string; name?: string; email: string }) => ({ id: u.id, name: u.name ?? u.email })),
        )
      } catch {
        // Non-blocking — dropdown will just show "Unassigned"
      }
    }
    loadAdmins()
  }, [])

  async function handleSubmit() {
    try {
      setSubmitting(true)
      setError(null)
      await trpc.admin.escalateAnomaly.mutate({
        alertId,
        assigneeId: assigneeId || undefined,
        priority,
        note,
      })
      onSuccess()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to escalate alert')
    } finally {
      setSubmitting(false)
    }
  }

  const isValid = note.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Escalate Alert</DialogTitle>
          <DialogDescription className="sr-only">Escalate this alert to an admin for further investigation.</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Assign to */}
        <div>
          <label htmlFor="escalation-assignee" className="block text-sm font-medium text-foreground">
            Assign to
          </label>
          <select
            id="escalation-assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Unassigned</option>
            {adminUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div>
          <span className="block text-sm font-medium text-foreground">Priority</span>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="escalation-priority"
                value="NORMAL"
                checked={priority === 'NORMAL'}
                onChange={() => setPriority('NORMAL')}
                className="accent-accent"
              />
              Normal
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="escalation-priority"
                value="URGENT"
                checked={priority === 'URGENT'}
                onChange={() => setPriority('URGENT')}
                className="accent-accent"
              />
              Urgent
            </label>
          </div>
        </div>

        {/* Note */}
        <div>
          <label htmlFor="escalation-note" className="block text-sm font-medium text-foreground">
            Note <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="escalation-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="Describe what should be investigated..."
          />
          {note.length > 0 && note.trim().length < 10 && (
            <p className="mt-1 text-xs text-muted-foreground">Minimum 10 characters required</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Escalating...' : 'Escalate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

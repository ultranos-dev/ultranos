'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'

interface AdminUser {
  id: string
  name: string
}

interface EscalationModalProps {
  alertId: string
  onClose: () => void
  onSuccess: () => void
}

export function EscalationModal({ alertId, onClose, onSuccess }: EscalationModalProps) {
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
          page: 1,
          pageSize: 50,
          roleFilter: 'ADMIN',
          statusFilter: 'ACTIVE',
        })
        setAdminUsers(
          result.users.map((u: any) => ({ id: u.id, name: u.name ?? u.email })),
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to escalate alert')
    } finally {
      setSubmitting(false)
    }
  }

  const isValid = note.trim().length >= 10

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-text-primary">Escalate Alert</h2>

        {error && (
          <div className="mt-3 rounded-xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">{error}</div>
        )}

        {/* Assign to */}
        <div className="mt-4">
          <label htmlFor="escalation-assignee" className="block text-sm font-medium text-text-primary">
            Assign to
          </label>
          <select
            id="escalation-assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">Unassigned</option>
            {adminUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="mt-4">
          <span className="block text-sm font-medium text-text-primary">Priority</span>
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
        <div className="mt-4">
          <label htmlFor="escalation-note" className="block text-sm font-medium text-text-primary">
            Note <span className="text-danger">*</span>
          </label>
          <textarea
            id="escalation-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Describe what should be investigated..."
          />
          {note.length > 0 && note.trim().length < 10 && (
            <p className="mt-1 text-xs text-text-secondary">Minimum 10 characters required</p>
          )}
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="rounded-full bg-brand-lime px-6 py-2.5 text-sm font-semibold text-brand-lime-contrast disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
          >
            {submitting ? 'Escalating...' : 'Escalate'}
          </button>
        </div>
      </div>
    </div>
  )
}

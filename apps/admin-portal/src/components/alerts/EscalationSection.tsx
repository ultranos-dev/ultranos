'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'

interface AdminUser {
  id: string
  name: string
}

interface EscalationSectionProps {
  alertId: string
  status: string
  assigneeName: string | null
  escalationPriority: string | null
  escalationNote: string | null
  escalatedByName: string | null
  escalatedAt: string | null
  resolutionNote: string | null
  resolvedByName: string | null
  resolvedAt: string | null
  onResolve: () => void
  onReassign: () => void
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EscalationSection({
  alertId,
  status,
  assigneeName,
  escalationPriority,
  escalationNote,
  escalatedByName,
  escalatedAt,
  resolutionNote,
  resolvedByName,
  resolvedAt,
  onResolve,
  onReassign,
}: EscalationSectionProps) {
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolveNote, setResolveNote] = useState('')
  const [resolving, setResolving] = useState(false)

  const [showReassign, setShowReassign] = useState(false)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [reassigning, setReassigning] = useState(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!showReassign) return
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
        // Non-blocking
      }
    }
    loadAdmins()
  }, [showReassign])

  async function handleResolve() {
    try {
      setResolving(true)
      setError(null)
      await trpc.admin.resolveAnomaly.mutate({ alertId, resolutionNote: resolveNote })
      setShowResolveForm(false)
      onResolve()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to resolve alert')
    } finally {
      setResolving(false)
    }
  }

  async function handleReassign(newAssigneeId: string) {
    try {
      setReassigning(true)
      setError(null)
      await trpc.admin.reassignAnomaly.mutate({ alertId, assigneeId: newAssigneeId })
      setShowReassign(false)
      onReassign()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reassign alert')
    } finally {
      setReassigning(false)
    }
  }

  const statusBadge =
    status === 'ESCALATED' ? (
      <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">Escalated</span>
    ) : (
      <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">Resolved</span>
    )

  const priorityBadge = escalationPriority === 'URGENT' ? (
    <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">URGENT</span>
  ) : (
    <span className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">NORMAL</span>
  )

  return (
    <div className="rounded-3xl border border-border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Escalation Details</h2>
        {statusBadge}
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">{error}</div>
      )}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Assigned to</dt>
          <dd className="font-medium">{assigneeName ?? 'Unassigned'}</dd>
        </div>
        <div className="flex justify-between items-center">
          <dt className="text-text-secondary">Priority</dt>
          <dd>{priorityBadge}</dd>
        </div>
        {escalationNote && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Note</dt>
            <dd className="font-medium max-w-xs text-end">{escalationNote}</dd>
          </div>
        )}
        {escalatedByName && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Escalated by</dt>
            <dd className="font-medium">{escalatedByName}</dd>
          </div>
        )}
        {escalatedAt && (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Escalated at</dt>
            <dd className="font-medium">{formatDateTime(escalatedAt)}</dd>
          </div>
        )}
      </dl>

      {/* Resolution details (if resolved) */}
      {status === 'RESOLVED' && (
        <dl className="mt-4 space-y-2 text-sm border-t border-border pt-4">
          {resolutionNote && (
            <div className="flex justify-between">
              <dt className="text-text-secondary">Resolution note</dt>
              <dd className="font-medium max-w-xs text-end">{resolutionNote}</dd>
            </div>
          )}
          {resolvedByName && (
            <div className="flex justify-between">
              <dt className="text-text-secondary">Resolved by</dt>
              <dd className="font-medium">{resolvedByName}</dd>
            </div>
          )}
          {resolvedAt && (
            <div className="flex justify-between">
              <dt className="text-text-secondary">Resolved at</dt>
              <dd className="font-medium">{formatDateTime(resolvedAt)}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Action buttons for ESCALATED status */}
      {status === 'ESCALATED' && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setShowResolveForm(!showResolveForm)}
            className="rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 hover:scale-[1.02] transition-transform duration-200"
          >
            Resolve
          </button>
          <button
            onClick={() => setShowReassign(!showReassign)}
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-text-primary hover:bg-surface hover:scale-[1.02] transition-transform duration-200"
          >
            Re-assign
          </button>
        </div>
      )}

      {/* Inline resolve form */}
      {showResolveForm && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <label htmlFor="resolution-note" className="block text-sm font-medium text-text-primary">
            Resolution Note <span className="text-danger">*</span>
          </label>
          <textarea
            id="resolution-note"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="Describe how this was resolved..."
          />
          {resolveNote.length > 0 && resolveNote.trim().length < 10 && (
            <p className="mt-1 text-xs text-text-secondary">Minimum 10 characters required</p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleResolve}
              disabled={resolveNote.trim().length < 10 || resolving}
              className="rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-green-700 hover:scale-[1.02] transition-transform duration-200"
            >
              {resolving ? 'Resolving...' : 'Confirm Resolve'}
            </button>
            <button
              onClick={() => setShowResolveForm(false)}
              className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-text-primary hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Inline reassign dropdown */}
      {showReassign && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <label htmlFor="reassign-select" className="block text-sm font-medium text-text-primary">
            Reassign to
          </label>
          <select
            id="reassign-select"
            disabled={reassigning}
            onChange={(e) => {
              if (e.target.value) handleReassign(e.target.value)
            }}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">Select an admin...</option>
            {adminUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowReassign(false)}
            className="mt-2 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

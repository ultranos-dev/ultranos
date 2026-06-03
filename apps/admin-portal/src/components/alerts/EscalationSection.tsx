'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'

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
      <Badge variant="warning">Escalated</Badge>
    ) : (
      <Badge variant="success">Resolved</Badge>
    )

  const priorityBadge = escalationPriority === 'URGENT' ? (
    <Badge variant="destructive">URGENT</Badge>
  ) : (
    <Badge variant="secondary">NORMAL</Badge>
  )

  return (
    <div className="rounded-3xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Escalation Details</h2>
        {statusBadge}
      </div>

      {error && (
        <div className="mt-3 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Assigned to</dt>
          <dd className="font-medium">{assigneeName ?? 'Unassigned'}</dd>
        </div>
        <div className="flex justify-between items-center">
          <dt className="text-muted-foreground">Priority</dt>
          <dd>{priorityBadge}</dd>
        </div>
        {escalationNote && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Note</dt>
            <dd className="font-medium max-w-xs text-end">{escalationNote}</dd>
          </div>
        )}
        {escalatedByName && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Escalated by</dt>
            <dd className="font-medium">{escalatedByName}</dd>
          </div>
        )}
        {escalatedAt && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Escalated at</dt>
            <dd className="font-medium">{formatDateTime(escalatedAt)}</dd>
          </div>
        )}
      </dl>

      {/* Resolution details (if resolved) */}
      {status === 'RESOLVED' && (
        <dl className="mt-4 space-y-2 text-sm border-t border-border pt-4">
          {resolutionNote && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Resolution note</dt>
              <dd className="font-medium max-w-xs text-end">{resolutionNote}</dd>
            </div>
          )}
          {resolvedByName && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Resolved by</dt>
              <dd className="font-medium">{resolvedByName}</dd>
            </div>
          )}
          {resolvedAt && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Resolved at</dt>
              <dd className="font-medium">{formatDateTime(resolvedAt)}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Action buttons for ESCALATED status */}
      {status === 'ESCALATED' && (
        <div className="mt-4 flex gap-3">
          <Button variant="success" onClick={() => setShowResolveForm(!showResolveForm)}>
            Resolve
          </Button>
          <Button variant="outline" onClick={() => setShowReassign(!showReassign)}>
            Re-assign
          </Button>
        </div>
      )}

      {/* Inline resolve form */}
      {showResolveForm && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <label htmlFor="resolution-note" className="block text-sm font-medium text-foreground">
            Resolution Note <span className="text-destructive">*</span>
          </label>
          <Textarea
            id="resolution-note"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            rows={3}
            className="mt-1"
            placeholder="Describe how this was resolved..."
          />
          {resolveNote.length > 0 && resolveNote.trim().length < 10 && (
            <p className="mt-1 text-xs text-muted-foreground">Minimum 10 characters required</p>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              variant="success"
              onClick={handleResolve}
              disabled={resolveNote.trim().length < 10 || resolving}
            >
              {resolving ? 'Resolving...' : 'Confirm Resolve'}
            </Button>
            <Button variant="outline" onClick={() => setShowResolveForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Inline reassign dropdown */}
      {showReassign && (
        <div className="mt-4 rounded-xl border border-border p-4">
          <label htmlFor="reassign-select" className="block text-sm font-medium text-foreground">
            Reassign to
          </label>
          <select
            id="reassign-select"
            disabled={reassigning}
            onChange={(e) => {
              if (e.target.value) handleReassign(e.target.value)
            }}
            className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Select an admin...</option>
            {adminUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => setShowReassign(false)} className="mt-2">
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}

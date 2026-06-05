'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// ================================================================
// Types
// ================================================================

type StatusFilter = 'ALL' | 'ACTIVE' | 'DISSOLVED'

interface MentorshipPairing {
  id: string
  mentorName: string
  mentorEmail: string
  menteeName: string
  menteeEmail: string
  labName: string
  startDate: string
  status: string
  dissolvedAt: string | null
  dissolvedReason: string | null
}

interface MentorshipStats {
  totalPaired: number
  unmatchedTechs: number
  avgPairingDurationDays: number
  checkinCompletionRate: number
}

interface EligibleMentor {
  practitionerId: string
  name: string
  labName: string
  labRole: string
}

interface CheckinRecord {
  id: string
  month: string
  status: string
  notes: string | null
  completedAt: string | null
}

interface PairingDetail {
  id: string
  mentorName: string
  mentorPractitionerId: string
  menteeName: string
  menteePractitionerId: string
  labName: string
  goals: string | null
  status: string
  startDate: string
  dissolvedAt: string | null
  dissolvedReason: string | null
  dissolvedNotes: string | null
  createdAt: string
  checkins: CheckinRecord[]
}

// ================================================================
// Sub-components
// ================================================================

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>
      {status}
    </Badge>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function truncateEmail(email: string): string {
  if (email.length <= 25) return email
  const [local, domain] = email.split('@')
  if (!domain) return email
  return `${local!.slice(0, 10)}...@${domain}`
}

function formatDuration(days: number): string {
  if (days < 30) return `${days}d`
  const months = Math.round(days / 30)
  return `${months} month${months !== 1 ? 's' : ''}`
}

// ================================================================
// Stats Cards
// ================================================================

function StatsCards({ stats, loading }: { stats: MentorshipStats | null; loading: boolean }) {
  const placeholder = '\u2014'

  const cards = [
    {
      label: 'Paired Techs',
      value: stats?.totalPaired ?? placeholder,
      className: 'bg-primary/10 border-primary/20',
    },
    {
      label: 'Unmatched Techs',
      value: stats?.unmatchedTechs ?? placeholder,
      className:
        stats && stats.unmatchedTechs > 0
          ? 'bg-warning/10 border-warning/20'
          : 'bg-popover border-border',
    },
    {
      label: 'Avg Duration',
      value: stats ? formatDuration(stats.avgPairingDurationDays) : placeholder,
      className: 'bg-popover border-border',
    },
    {
      label: 'Check-in Rate',
      value: stats ? `${stats.checkinCompletionRate}%` : placeholder,
      className:
        stats && stats.checkinCompletionRate >= 80
          ? 'bg-success/10 border-success/20'
          : stats && stats.checkinCompletionRate >= 50
            ? 'bg-warning/10 border-warning/20'
            : stats
              ? 'bg-destructive/10 border-destructive/20'
              : 'bg-popover border-border',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl border p-6 shadow-card ${card.className}`}
        >
          <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            {loading ? '...' : card.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ================================================================
// Create Pairing Modal (Task 5 — AC #2)
// ================================================================

function CreatePairingModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [mentors, setMentors] = useState<EligibleMentor[]>([])
  const [mentees, setMentees] = useState<{ practitionerId: string; name: string }[]>([])
  const [selectedMentor, setSelectedMentor] = useState('')
  const [selectedMentee, setSelectedMentee] = useState('')
  const [goals, setGoals] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]!)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSelectedMentor('')
    setSelectedMentee('')
    setGoals('')
    setStartDate(new Date().toISOString().split('T')[0]!)

    // Fetch eligible mentors
    trpc.admin.listEligibleMentors.query().then(setMentors).catch(() => {})

    // Fetch all lab technicians as potential mentees
    // Using listAllLabStaff with no filters, limited set
    trpc.admin.listAllLabStaff
      .query({ limit: 50 })
      .then((result: { items: Array<{ practitionerId: string; email?: string }> }) => {
        setMentees(
          result.items.map((s) => ({
            practitionerId: s.practitionerId,
            name: s.email || s.practitionerId.slice(0, 8),
          })),
        )
      })
      .catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedMentor || !selectedMentee) return

    if (selectedMentor === selectedMentee) {
      setError('Mentor and mentee cannot be the same person')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await trpc.admin.createMentorshipPairing.mutate({
        mentorPractitionerId: selectedMentor,
        menteePractitionerId: selectedMentee,
        goals: goals.trim() || undefined,
        startDate,
      })
      onCreated()
      onClose()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to create pairing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Mentorship Pairing</DialogTitle>
          <DialogDescription className="sr-only">Create a new mentorship pairing between a mentor and mentee.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mentor selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Mentor (Supervisor / Lab Manager)
            </label>
            <select
              value={selectedMentor}
              onChange={(e) => setSelectedMentor(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select a mentor...</option>
              {mentors.map((m) => (
                <option key={m.practitionerId} value={m.practitionerId}>
                  {m.name} — {m.labName} ({m.labRole})
                </option>
              ))}
            </select>
          </div>

          {/* Mentee selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Mentee</label>
            <select
              value={selectedMentee}
              onChange={(e) => setSelectedMentee(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select a mentee...</option>
              {mentees
                .filter((m) => m.practitionerId !== selectedMentor)
                .map((m) => (
                  <option key={m.practitionerId} value={m.practitionerId}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Goals */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Goals</label>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Mentorship goals..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !selectedMentor || !selectedMentee}
            >
              {submitting ? 'Creating...' : 'Create Pairing'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// Dissolve Pairing Modal (Task 6 — AC #3)
// ================================================================

function DissolveModal({
  pairingId,
  open,
  onClose,
  onDissolved,
}: {
  pairingId: string | null
  open: boolean
  onClose: () => void
  onDissolved: () => void
}) {
  const [reason, setReason] = useState<'COMPLETED' | 'REASSIGNED' | 'INACTIVE' | 'OTHER'>('COMPLETED')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('COMPLETED')
      setNotes('')
      setError(null)
    }
  }, [open])

  async function handleDissolve() {
    if (!pairingId) return
    setSubmitting(true)
    setError(null)
    try {
      await trpc.admin.dissolveMentorshipPairing.mutate({
        pairingId,
        reason,
        notes: notes.trim() || undefined,
      })
      onDissolved()
      onClose()
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to dissolve pairing')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dissolve Pairing</DialogTitle>
          <DialogDescription>
            This will end the mentorship pairing. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="COMPLETED">Completed</option>
              <option value="REASSIGNED">Reassigned</option>
              <option value="INACTIVE">Inactive</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Additional notes..."
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDissolve}
            disabled={submitting}
          >
            {submitting ? 'Dissolving...' : 'Dissolve Pairing'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ================================================================
// Detail Panel (inline expand for check-in history)
// ================================================================

function PairingDetailPanel({
  pairingId,
  onClose,
}: {
  pairingId: string
  onClose: () => void
}) {
  const [detail, setDetail] = useState<PairingDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    trpc.admin.getMentorshipPairingDetail
      .query({ pairingId })
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pairingId])

  if (loading) return <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading details...</td></tr>
  if (!detail) return null

  return (
    <tr>
      <td colSpan={6} className="bg-primary/10/30 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Goals: <span className="font-normal text-muted-foreground">{detail.goals || 'None set'}</span>
            </p>
            {detail.dissolvedReason && (
              <p className="mt-1 text-sm text-muted-foreground">
                Dissolved: {detail.dissolvedReason}
                {detail.dissolvedNotes && ` — ${detail.dissolvedNotes}`}
              </p>
            )}
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Check-in History</p>
              {detail.checkins.length === 0 ? (
                <p className="text-sm text-muted-foreground">No check-ins recorded</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.checkins.map((c) => (
                    <Badge
                      key={c.id}
                      variant={
                        c.status === 'COMPLETED' ? 'success'
                          : c.status === 'SKIPPED' ? 'warning'
                          : 'secondary'
                      }
                    >
                      {c.month}: {c.status}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close detail"
          >
            Close
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ================================================================
// Main Page (Task 4 — AC #1, #4)
// ================================================================

const STATUS_TABS: StatusFilter[] = ['ALL', 'ACTIVE', 'DISSOLVED']
const PAGE_SIZE = 20

export default function MentorshipPage() {
  const [pairings, setPairings] = useState<MentorshipPairing[]>([])
  const [stats, setStats] = useState<MentorshipStats | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [dissolvePairingId, setDissolvePairingId] = useState<string | null>(null)
  const [expandedPairingId, setExpandedPairingId] = useState<string | null>(null)

  const fetchPairings = useCallback(async (cursor?: string) => {
    try {
      setLoading(true)
      setError(null)
      const result = await trpc.admin.listMentorshipPairings.query({
        statusFilter: statusFilter === 'ALL' ? 'ALL' : statusFilter,
        limit: PAGE_SIZE,
        cursor,
      })
      if (cursor) {
        setPairings((prev) => [...prev, ...result.items])
      } else {
        setPairings(result.items)
      }
      setNextCursor(result.nextCursor)
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to load pairings')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    trpc.admin.getMentorshipStats.query().then(setStats).catch(() => {}).finally(() => setStatsLoading(false))
  }, [])

  useEffect(() => {
    fetchPairings()
  }, [fetchPairings])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  function handleFilterChange(filter: StatusFilter) {
    setStatusFilter(filter)
    setNextCursor(null)
    setExpandedPairingId(null)
  }

  function handleCreated() {
    fetchPairings()
    fetchStats()
  }

  function handleDissolved() {
    fetchPairings()
    fetchStats()
  }

  return (
    <>
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Stats cards */}
        <StatsCards stats={stats} loading={statsLoading} />

        {/* Top bar: filter tabs + CTA */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => handleFilterChange(tab)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <Button onClick={() => setShowCreateModal(true)}>
            Create Pairing
          </Button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Pairings table */}
        {loading && pairings.length === 0 ? (
          <div className="mt-6 text-muted-foreground">Loading pairings...</div>
        ) : pairings.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-card p-12 text-center">
            <p className="text-lg font-medium text-foreground">No mentorship pairings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a pairing to connect experienced techs with junior staff.
            </p>
            <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
              Create Pairing
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Mentor</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Mentee</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Lab</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Start Date</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {pairings.map((p) => (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setExpandedPairingId(expandedPairingId === p.id ? null : p.id)}
                        className="cursor-pointer transition-colors hover:bg-primary/5"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{p.mentorName}</p>
                          <p className="text-xs text-muted-foreground">{truncateEmail(p.mentorEmail)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{p.menteeName}</p>
                          <p className="text-xs text-muted-foreground">{truncateEmail(p.menteeEmail)}</p>
                        </td>
                        <td className="px-4 py-3 text-foreground">{p.labName}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(p.startDate)}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          {p.status === 'ACTIVE' && (
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDissolvePairingId(p.id)
                              }}
                            >
                              Dissolve
                            </Button>
                          )}
                        </td>
                      </tr>
                      {expandedPairingId === p.id && (
                        <PairingDetailPanel
                          pairingId={p.id}
                          onClose={() => setExpandedPairingId(null)}
                        />
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => fetchPairings(nextCursor)}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <CreatePairingModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />
      <DissolveModal
        pairingId={dissolvePairingId}
        open={!!dissolvePairingId}
        onClose={() => setDissolvePairingId(null)}
        onDissolved={handleDissolved}
      />
    </>
  )
}

'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

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
  const isActive = status === 'ACTIVE'
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isActive ? 'bg-success-subtle text-success' : 'bg-surface text-text-secondary'
      }`}
    >
      {status}
    </span>
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
      className: 'bg-accent-subtle border-accent/20',
    },
    {
      label: 'Unmatched Techs',
      value: stats?.unmatchedTechs ?? placeholder,
      className:
        stats && stats.unmatchedTechs > 0
          ? 'bg-warning-subtle border-warning/20'
          : 'bg-surface-raised border-border',
    },
    {
      label: 'Avg Duration',
      value: stats ? formatDuration(stats.avgPairingDurationDays) : placeholder,
      className: 'bg-surface-raised border-border',
    },
    {
      label: 'Check-in Rate',
      value: stats ? `${stats.checkinCompletionRate}%` : placeholder,
      className:
        stats && stats.checkinCompletionRate >= 80
          ? 'bg-success-subtle border-success/20'
          : stats && stats.checkinCompletionRate >= 50
            ? 'bg-warning-subtle border-warning/20'
            : stats
              ? 'bg-danger-subtle border-danger/20'
              : 'bg-surface-raised border-border',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl border p-6 shadow-card ${card.className}`}
        >
          <p className="text-sm font-medium text-text-secondary">{card.label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
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
      .then((result) => {
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create pairing')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-surface-raised p-6 shadow-lg border border-border">
        <h2 className="text-lg font-semibold text-text-primary">Create Mentorship Pairing</h2>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Mentor selector */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Mentor (Supervisor / Lab Manager)
            </label>
            <select
              value={selectedMentor}
              onChange={(e) => setSelectedMentor(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
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
            <label className="block text-sm font-medium text-text-secondary mb-1">Mentee</label>
            <select
              value={selectedMentee}
              onChange={(e) => setSelectedMentee(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
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
            <label className="block text-sm font-medium text-text-secondary mb-1">Goals</label>
            <textarea
              value={goals}
              onChange={(e) => setGoals(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Mentorship goals..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              required
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-primary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedMentor || !selectedMentee}
              className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Pairing'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to dissolve pairing')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-surface-raised p-6 shadow-lg border border-border">
        <h2 className="text-lg font-semibold text-text-primary">Dissolve Pairing</h2>
        <p className="mt-1 text-sm text-text-secondary">
          This will end the mentorship pairing. This action cannot be undone.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="COMPLETED">Completed</option>
              <option value="REASSIGNED">Reassigned</option>
              <option value="INACTIVE">Inactive</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Additional notes..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-primary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDissolve}
              disabled={submitting}
              className="rounded-full bg-danger px-5 py-2 text-sm font-semibold text-white hover:bg-danger/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Dissolving...' : 'Dissolve Pairing'}
            </button>
          </div>
        </div>
      </div>
    </div>
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

  if (loading) return <tr><td colSpan={6} className="px-4 py-6 text-center text-text-secondary">Loading details...</td></tr>
  if (!detail) return null

  return (
    <tr>
      <td colSpan={6} className="bg-accent-subtle/30 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-text-primary">
              Goals: <span className="font-normal text-text-secondary">{detail.goals || 'None set'}</span>
            </p>
            {detail.dissolvedReason && (
              <p className="mt-1 text-sm text-text-secondary">
                Dissolved: {detail.dissolvedReason}
                {detail.dissolvedNotes && ` — ${detail.dissolvedNotes}`}
              </p>
            )}
            <div className="mt-3">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Check-in History</p>
              {detail.checkins.length === 0 ? (
                <p className="text-sm text-text-muted">No check-ins recorded</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {detail.checkins.map((c) => (
                    <span
                      key={c.id}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.status === 'COMPLETED'
                          ? 'bg-success-subtle text-success'
                          : c.status === 'SKIPPED'
                            ? 'bg-warning-subtle text-warning'
                            : 'bg-surface text-text-secondary'
                      }`}
                    >
                      {c.month}: {c.status}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-sm"
            aria-label="Close detail"
          >
            Close
          </button>
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
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load pairings')
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
      <TopHeader title="Mentorship" description="Manage mentorship pairings across the lab network." />
      <div className="mx-auto max-w-7xl px-8 py-6">
        {/* Stats cards */}
        <StatsCards stats={stats} loading={statsLoading} />

        {/* Top bar: filter tabs + CTA */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1 rounded-full border border-border bg-surface p-0.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => handleFilterChange(tab)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === tab
                    ? 'bg-accent text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
          >
            Create Pairing
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl bg-danger-subtle p-3 text-sm text-danger">{error}</div>
        )}

        {/* Pairings table */}
        {loading && pairings.length === 0 ? (
          <div className="mt-6 text-text-secondary">Loading pairings...</div>
        ) : pairings.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-border bg-white p-12 text-center">
            <p className="text-lg font-medium text-text-primary">No mentorship pairings yet</p>
            <p className="mt-1 text-sm text-text-muted">
              Create a pairing to connect experienced techs with junior staff.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-block rounded-full bg-brand-lime px-5 py-2 text-sm font-semibold text-black hover:bg-brand-lime/90 transition-colors"
            >
              Create Pairing
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-black">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Mentor</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Mentee</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Lab</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Start Date</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-start font-medium text-white text-xs uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {pairings.map((p) => (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setExpandedPairingId(expandedPairingId === p.id ? null : p.id)}
                        className="cursor-pointer transition-colors hover:bg-brand-lime/5"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{p.mentorName}</p>
                          <p className="text-xs text-text-muted">{truncateEmail(p.mentorEmail)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-text-primary">{p.menteeName}</p>
                          <p className="text-xs text-text-muted">{truncateEmail(p.menteeEmail)}</p>
                        </td>
                        <td className="px-4 py-3 text-text-primary">{p.labName}</td>
                        <td className="px-4 py-3 text-text-muted">{formatDate(p.startDate)}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          {p.status === 'ACTIVE' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setDissolvePairingId(p.id)
                              }}
                              className="rounded-full border border-danger/30 px-3 py-1 text-xs font-medium text-danger hover:bg-danger-subtle transition-colors"
                            >
                              Dissolve
                            </button>
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
                <button
                  onClick={() => fetchPairings(nextCursor)}
                  disabled={loading}
                  className="rounded-full border border-border px-5 py-2 text-sm font-medium text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
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

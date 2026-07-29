'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Network, FileSearch } from '@ultranos/ui-kit/icons'
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
  const t = useTranslations('mentorship')
  const placeholder = '\u2014'

  const cards = [
    {
      label: t('statsPairedTechs'),
      value: stats?.totalPaired ?? placeholder,
      className: 'bg-primary/10 border-primary/20',
    },
    {
      label: t('statsUnmatchedTechs'),
      value: stats?.unmatchedTechs ?? placeholder,
      className:
        stats && stats.unmatchedTechs > 0
          ? 'bg-warning/10 border-warning/20'
          : 'bg-card border-border',
    },
    {
      label: t('statsAvgDuration'),
      value: stats ? formatDuration(stats.avgPairingDurationDays) : placeholder,
      className: 'bg-card border-border',
    },
    {
      label: t('statsCheckInRate'),
      value: stats ? `${stats.checkinCompletionRate}%` : placeholder,
      className:
        stats && stats.checkinCompletionRate >= 80
          ? 'bg-success/10 border-success/20'
          : stats && stats.checkinCompletionRate >= 50
            ? 'bg-warning/10 border-warning/20'
            : stats
              ? 'bg-destructive/10 border-destructive/20'
              : 'bg-card border-border',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-6 shadow-card ${card.className}`}
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
  const t = useTranslations('mentorship')
  const tCommon = useTranslations('common')
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
      setError((err as Error)?.message ?? t('createError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription className="sr-only">Create a new mentorship pairing between a mentor and mentee.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mentor selector */}
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              {t('mentor')}
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('mentee')}</label>
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('notes')}</label>
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
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('startDate')}</label>
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
              {tCommon('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting || !selectedMentor || !selectedMentee}
            >
              {submitting ? 'Creating...' : t('createPairing')}
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
  const t = useTranslations('mentorship')
  const tCommon = useTranslations('common')
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
      setError((err as Error)?.message ?? t('dissolveError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('dissolveTitle')}</DialogTitle>
          <DialogDescription>
            {t('dissolveDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t('dissolveReason')}</label>
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
              {t('notes')}
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
            {tCommon('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDissolve}
            disabled={submitting}
          >
            {submitting ? 'Dissolving...' : t('dissolve')}
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
  const t = useTranslations('mentorship')
  const [pairings, setPairings] = useState<MentorshipPairing[]>([])
  const [stats, setStats] = useState<MentorshipStats | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [search, setSearch] = useState('')
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
      setError((err as Error)?.message ?? t('errorLoad'))
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

  const q = search.trim().toLowerCase()
  const visible = pairings.filter(
    (p) => !q || p.mentorName.toLowerCase().includes(q) || p.menteeName.toLowerCase().includes(q),
  )

  return (
    <>
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{t('pageTitle')}</h1>

        {/* Stats cards */}
        <StatsCards stats={stats} loading={statsLoading} />

        {/* Toolbar: filter tabs + search + create action — always visible */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleFilterChange(tab)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={statusFilter === tab}
              >
                {tab === 'ALL' ? t('filterAll') : tab === 'ACTIVE' ? t('filterActive') : t('filterDissolved')}
              </button>
            ))}
          </div>
          <SearchInput
            dir="auto"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-[200px] flex-1"
            aria-label={t('searchPlaceholder')}
          />
          <Button onClick={() => setShowCreateModal(true)}>
            {t('createPairing')}
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Content panel — single cohesive box */}
        <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {loading && pairings.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">{t('loadingPairings')}</div>
          ) : pairings.length === 0 ? (
            <div className="flex min-h-[18rem] items-center justify-center">
              <EmptyState
                icon={Network}
                title={t('noPairings')}
                description={t('noPairingsDescription')}
                action={{ label: t('createPairing'), onClick: () => setShowCreateModal(true) }}
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <EmptyState
                icon={FileSearch}
                title={t('noResultsTitle')}
                description={t('noResultsDescription')}
                action={{ label: t('clearSearch'), onClick: () => setSearch('') }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colMentor')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colMentee')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colLab')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStartDate')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colStatus')}</th>
                    <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((p) => (
                    <Fragment key={p.id}>
                      <tr
                        onClick={() => setExpandedPairingId(expandedPairingId === p.id ? null : p.id)}
                        className="cursor-pointer transition-colors hover:bg-muted/50"
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
                              {t('dissolve')}
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
          )}
        </div>

        {/* Load more — below the content box */}
        {visible.length > 0 && nextCursor && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={() => fetchPairings(nextCursor)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </Button>
          </div>
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

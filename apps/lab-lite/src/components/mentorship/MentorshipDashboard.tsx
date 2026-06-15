'use client'

/**
 * MentorshipDashboard — Story 46.5 (Task 5)
 *
 * Shows active mentorship pairings for the current technician, with inline
 * check-in support, journal navigation, and warning indicators for overdue
 * or inactive pairings.
 *
 * RTL-compatible: all spacing uses logical CSS Tailwind utilities.
 * All display strings sourced from the 'mentorship' next-intl namespace.
 *
 * No PHI: operates on mentorship/staff data only. No patient data.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { getDb } from '@/lib/db'
import type { MentorshipPairing } from '@/lib/mentorship-types'
import { CheckInPrompt } from '@/components/mentorship/CheckInPrompt'
import { CheckInForm } from '@/components/mentorship/CheckInForm'
import { LearningJournal } from '@/components/mentorship/LearningJournal'
import { JournalEntryForm } from '@/components/mentorship/JournalEntryForm'
import { getOverdueCheckIns } from '@/lib/check-in-scheduler'
import { Button } from '@/components/ui/Button'
import { AlertTriangle, AlertCircle } from '@ultranos/ui-kit/icons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MentorshipDashboardProps {
  currentUserId: string
}

type ActiveView =
  | { type: 'list' }
  | { type: 'checkIn'; pairingId: string }
  | { type: 'journal'; pairingId: string }
  | { type: 'addJournalEntry'; pairingId: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the partner's display name from the current user's perspective. */
function getPartnerName(pairing: MentorshipPairing, currentUserId: string): string {
  return currentUserId === pairing.mentorId ? pairing.menteeName : pairing.mentorName
}

/** Returns whether the current user is the mentor in this pairing. */
function isMentor(pairing: MentorshipPairing, currentUserId: string): boolean {
  return pairing.mentorId === currentUserId
}

/** Format an ISO date string as locale date, or a fallback string if null. */
function formatDate(iso: string | null, fallback: string): string {
  if (!iso) return fallback
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

/** True if nextCheckInDue is in the past (overdue check-in — amber). */
function isOverdue(pairing: MentorshipPairing): boolean {
  return pairing.nextCheckInDue < new Date().toISOString()
}

/** True if there has been no activity in 30+ days (red). */
function isInactive(pairing: MentorshipPairing): boolean {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  if (pairing.lastCheckInAt) {
    return pairing.lastCheckInAt < thirtyDaysAgo
  }
  // No check-in at all: use pairing creation date
  return pairing.createdAt < thirtyDaysAgo
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MentorshipDashboard({ currentUserId }: MentorshipDashboardProps) {
  const t = useTranslations('mentorship')

  const [pairings, setPairings] = useState<MentorshipPairing[]>([])
  const [journalCounts, setJournalCounts] = useState<Record<string, number>>({})
  const [overduePairings, setOverduePairings] = useState<MentorshipPairing[]>([])
  const [loading, setLoading] = useState(true)
  const [activeView, setActiveView] = useState<ActiveView>({ type: 'list' })

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const db = getDb()

      const allPairings = await db.mentorship_pairings
        .filter((p) => p.mentorId === currentUserId || p.menteeId === currentUserId)
        .toArray()

      // Count journal entries per pairing
      const counts: Record<string, number> = {}
      for (const pairing of allPairings) {
        counts[pairing.id] = await db.learning_journal
          .where('pairingId')
          .equals(pairing.id)
          .count()
      }

      // Active pairings only — sorted: active first, then paused, then completed
      const sorted = [...allPairings].sort((a, b) => {
        const order = { active: 0, paused: 1, completed: 2 }
        return order[a.status] - order[b.status]
      })

      setPairings(sorted)
      setJournalCounts(counts)

      // Overdue check-ins (for the CheckInPrompt banner)
      const overdue = await getOverdueCheckIns(currentUserId)
      setOverduePairings(overdue)
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleCheckInClick(pairingId: string) {
    setActiveView({ type: 'checkIn', pairingId })
  }

  function handleCheckInComplete() {
    setActiveView({ type: 'list' })
    void loadData()
  }

  function handleCheckInCancel() {
    setActiveView({ type: 'list' })
  }

  function handleViewJournal(pairingId: string) {
    setActiveView({ type: 'journal', pairingId })
  }

  function handleAddJournalEntry(pairingId: string) {
    setActiveView({ type: 'addJournalEntry', pairingId })
  }

  function handleBackToList() {
    setActiveView({ type: 'list' })
    void loadData()
  }

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const currentPairing =
    activeView.type !== 'list'
      ? pairings.find((p) => p.id === activeView.pairingId) ?? null
      : null

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('dashboardLoading')}>
        {[1, 2].map((n) => (
          <div
            key={n}
            className="h-24 animate-pulse rounded-xl border border-border bg-muted"
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Check-In form view
  // ---------------------------------------------------------------------------

  if (activeView.type === 'checkIn') {
    const checkInPairing = pairings.find((p) => p.id === activeView.pairingId)
    if (!checkInPairing || checkInPairing.status !== 'active') {
      setActiveView({ type: 'list' })
      return null
    }
    return (
      <section aria-label={t('checkInFormSection')} className="flex flex-col gap-4">
        {/* Back navigation */}
        <button
          type="button"
          onClick={handleCheckInCancel}
          className="self-start text-sm text-primary-600 underline-offset-2 hover:underline
            focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <span className="inline-block rtl:scale-x-[-1]" aria-hidden>←</span>{' '}{t('dashboardBack')}
        </button>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {t('checkInFormTitle', { name: getPartnerName(checkInPairing, currentUserId) })}
          </h2>
          <CheckInForm
            pairing={checkInPairing}
            currentUserId={currentUserId}
            onComplete={handleCheckInComplete}
            onCancel={handleCheckInCancel}
          />
        </div>
      </section>
    )
  }

  // ---------------------------------------------------------------------------
  // Journal view
  // ---------------------------------------------------------------------------

  if (activeView.type === 'journal' && currentPairing) {
    return (
      <section aria-label={t('journalViewSection')} className="flex flex-col gap-4">
        {/* Back navigation */}
        <button
          type="button"
          onClick={handleBackToList}
          className="self-start text-sm text-primary-600 underline-offset-2 hover:underline
            focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <span className="inline-block rtl:scale-x-[-1]" aria-hidden>←</span>{' '}{t('dashboardBack')}
        </button>

        <LearningJournal
          pairing={currentPairing}
          currentUserId={currentUserId}
          onAddEntry={() => handleAddJournalEntry(currentPairing.id)}
        />
      </section>
    )
  }

  // ---------------------------------------------------------------------------
  // Add journal entry view
  // ---------------------------------------------------------------------------

  if (activeView.type === 'addJournalEntry' && currentPairing) {
    return (
      <section aria-label={t('journalAddEntrySection')} className="flex flex-col gap-4">
        {/* Back to journal */}
        <button
          type="button"
          onClick={() => setActiveView({ type: 'journal', pairingId: currentPairing.id })}
          className="self-start text-sm text-primary-600 underline-offset-2 hover:underline
            focus:outline-none focus:ring-2 focus:ring-primary-300"
        >
          <span className="inline-block rtl:scale-x-[-1]" aria-hidden>←</span>{' '}{t('dashboardBackToJournal')}
        </button>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {t('journalAddEntry')}
          </h2>
          <JournalEntryForm
            pairing={currentPairing}
            currentUserId={currentUserId}
            authorRole={isMentor(currentPairing, currentUserId) ? 'mentor' : 'mentee'}
            onComplete={() => setActiveView({ type: 'journal', pairingId: currentPairing.id })}
            onCancel={() => setActiveView({ type: 'journal', pairingId: currentPairing.id })}
          />
        </div>
      </section>
    )
  }

  // ---------------------------------------------------------------------------
  // Main list view
  // ---------------------------------------------------------------------------

  return (
    <section aria-label={t('dashboardSectionLabel')} className="flex flex-col gap-4">
      {/* Page title */}
      <h1 className="text-lg font-semibold text-foreground">{t('dashboardTitle')}</h1>

      {/* Overdue check-in banner */}
      {overduePairings.length > 0 && (
        <CheckInPrompt
          pairings={overduePairings}
          onCheckIn={handleCheckInClick}
        />
      )}

      {/* No pairings state */}
      {pairings.length === 0 && (
        <div
          role="status"
          className="rounded-xl border border-dashed border-border px-6 py-10 text-center"
        >
          <p className="text-sm text-muted-foreground">{t('dashboardNoPairings')}</p>
        </div>
      )}

      {/* Pairing cards */}
      {pairings.length > 0 && (
        <ol className="flex flex-col gap-4" aria-label={t('dashboardPairingListLabel')}>
          {pairings.map((pairing) => {
            const partner = getPartnerName(pairing, currentUserId)
            const role = isMentor(pairing, currentUserId) ? t('dashboardRoleMentor') : t('dashboardRoleMentee')
            const overdue = isOverdue(pairing)
            const inactive = isInactive(pairing)
            const journalCount = journalCounts[pairing.id] ?? 0

            return (
              <li
                key={pairing.id}
                className={
                  'rounded-xl border p-4 shadow-sm transition-shadow ' +
                  (inactive
                    ? 'border-red-200 bg-red-50'
                    : overdue
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-border bg-card')
                }
              >
                {/* Top row: partner name + warning indicators */}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{partner}</span>

                  {/* Role badge */}
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                      (isMentor(pairing, currentUserId)
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800')
                    }
                  >
                    {role}
                  </span>

                  {/* Status badge */}
                  <span
                    className={
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ' +
                      (pairing.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : pairing.status === 'paused'
                        ? 'bg-muted text-foreground'
                        : 'bg-muted text-muted-foreground')
                    }
                  >
                    {t(`dashboardStatus_${pairing.status}`)}
                  </span>

                  {/* Red warning — no activity in 30+ days */}
                  {inactive && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700"
                      title={t('dashboardInactiveWarning')}
                    >
                      <AlertCircle size={12} aria-hidden="true" />
                      {t('dashboardInactiveWarning')}
                    </span>
                  )}

                  {/* Amber warning — overdue check-in (only shown if not already red) */}
                  {!inactive && overdue && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                      title={t('dashboardOverdueWarning')}
                    >
                      <AlertTriangle size={12} aria-hidden="true" />
                      {t('dashboardOverdueWarning')}
                    </span>
                  )}
                </div>

                {/* Details row */}
                <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <div>
                    <dt className="font-medium text-muted-foreground">{t('dashboardLastCheckIn')}</dt>
                    <dd>{formatDate(pairing.lastCheckInAt, t('dashboardNever'))}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">{t('dashboardNextCheckIn')}</dt>
                    <dd>{formatDate(pairing.nextCheckInDue, '—')}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">{t('dashboardJournalCount')}</dt>
                    <dd>{journalCount}</dd>
                  </div>
                </dl>

                {/* Action buttons — only for active/paused pairings */}
                {pairing.status !== 'completed' && (
                  <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                    {pairing.status === 'active' && (
                      <Button
                        type="button"
                        variant={overdue ? 'warning' : 'primary'}
                        onClick={() => handleCheckInClick(pairing.id)}
                        aria-label={t('dashboardCheckInAriaLabel', { name: partner })}
                      >
                        {t('checkInButton')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleViewJournal(pairing.id)}
                      aria-label={t('dashboardViewJournalAriaLabel', { name: partner })}
                    >
                      {t('dashboardViewJournal')}
                    </Button>
                  </div>
                )}

                {/* Completed pairings: journal-only */}
                {pairing.status === 'completed' && (
                  <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => handleViewJournal(pairing.id)}
                      aria-label={t('dashboardViewJournalAriaLabel', { name: partner })}
                    >
                      {t('dashboardViewJournal')}
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

'use client'

/**
 * CheckInPrompt — Story 46.5 (Task 3)
 *
 * Amber warning banner shown on the dashboard when one or more mentorship
 * check-ins are overdue. Not a safety-critical alert (amber, not red).
 *
 * RTL-compatible: uses logical CSS properties throughout.
 * All display strings sourced from the 'mentorship' next-intl namespace.
 */

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import type { MentorshipPairing } from '@/lib/mentorship-types'
import { AlertTriangle } from '@ultranos/ui-kit/icons'

export interface CheckInPromptProps {
  /** Overdue active pairings for the current technician */
  pairings: MentorshipPairing[]
  /** Called when the user clicks "Check In" for a specific pairing */
  onCheckIn: (pairingId: string) => void
}

/** Compute how many calendar days overdue a pairing is (always >= 1). */
function daysOverdue(nextCheckInDue: string): number {
  const dueMs = new Date(nextCheckInDue).getTime()
  const nowMs = Date.now()
  return Math.max(1, Math.floor((nowMs - dueMs) / (1000 * 60 * 60 * 24)))
}

export function CheckInPrompt({ pairings, onCheckIn }: CheckInPromptProps) {
  const t = useTranslations('mentorship')

  if (pairings.length === 0) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        {/* Warning icon — non-directional, no mirror needed */}
        <AlertTriangle size={16} className="shrink-0 text-amber-600" aria-hidden="true" />
        <span>
          {t('checkInOverdueCount', { count: pairings.length })}
        </span>
      </div>

      {/* Per-pairing list */}
      <ul className="mt-3 flex flex-col gap-2">
        {pairings.map((pairing) => {
          const days = daysOverdue(pairing.nextCheckInDue)
          return (
            <li
              key={pairing.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-100 px-3 py-2"
            >
              <div className="flex flex-col gap-0.5 text-sm text-amber-900">
                {/* Partner name — no PHI risk, mentorship partner names are staff, not patients */}
                <span className="font-medium">
                  {t('checkInPartnerLabel', {
                    name: `${pairing.mentorName} — ${pairing.menteeName}`,
                  })}
                </span>
                <span className="text-xs text-amber-700">
                  {t('checkInDaysOverdue', { count: days })}
                </span>
              </div>
              <Button
                variant="warning"
                onClick={() => onCheckIn(pairing.id)}
                aria-label={t('checkInButtonAriaLabel', { count: days })}
                className="shrink-0"
              >
                {t('checkInButton')}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

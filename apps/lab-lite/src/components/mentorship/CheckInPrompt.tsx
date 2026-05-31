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
        <svg
          className="h-4 w-4 shrink-0 text-amber-600"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
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
                    name: `${pairing.mentorName} → ${pairing.menteeName}`,
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

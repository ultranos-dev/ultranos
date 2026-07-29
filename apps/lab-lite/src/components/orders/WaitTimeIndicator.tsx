'use client'

import { useTranslations } from 'next-intl'
import type { TestTatProfile } from '@/lib/test-tat-database'

interface WaitTimeIndicatorProps {
  profile: TestTatProfile
}

/**
 * Static wait time indicator for a single test.
 * Shows test name, estimated minutes, and a waiting status icon.
 * Indicator is static (shows estimated time at sample collection) — not a live countdown.
 *
 * Story 45.5 — Task 4
 */
export function WaitTimeIndicator({ profile }: WaitTimeIndicatorProps) {
  const t = useTranslations('tripOptimizer')

  return (
    <div
      data-testid="wait-time-indicator"
      className="flex items-center gap-3 rounded-lg border border-primary bg-primary/10 px-4 py-3"
    >
      {/* Status icon */}
      <span
        data-testid="wait-status-icon"
        aria-label={t('testWaiting')}
        className="flex-shrink-0 text-2xl"
        role="img"
      >
        ⏳
      </span>

      {/* Test info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary">{profile.loincDisplay}</p>
        <p className="text-xs text-primary">
          {t('estimatedMinutes', { minutes: profile.estimatedMinutes })}
        </p>
      </div>

      {/* Visual minute badge */}
      <div className="flex-shrink-0 text-right">
        <span
          data-testid="wait-time-minutes"
          className="inline-block rounded-full bg-blue-200 px-2.5 py-1 text-xs font-bold text-primary"
        >
          ~{profile.estimatedMinutes}m
        </span>
      </div>
    </div>
  )
}

'use client'

/**
 * StreakProgress.tsx — Story 51.7: Gamified Team Quality Engagement
 *
 * Displays the current Zero Rejection streak with collaborative messaging.
 * Uses CSS-only counter/flame visual — no external images.
 * RTL-safe: progress bar uses logical width, text uses dir-aware alignment.
 */

import { Flame, CircleCheck } from '@ultranos/ui-kit/icons'
import type { Streak } from '@/lib/achievement-service'

interface StreakProgressProps {
  streak: Streak
}

export function StreakProgress({ streak }: StreakProgressProps) {
  if (streak.type !== 'ZERO_REJECTION') return null

  const { currentDays } = streak
  // Progress toward a 7-day Zero Rejection Week achievement (capped at 100%)
  const progressPct = Math.min((currentDays / 7) * 100, 100)
  const isComplete = currentDays >= 7

  return (
    <div
      className="rounded-lg border border-green-200 bg-green-50 p-4"
      data-testid="streak-progress"
      data-streak-days={currentDays}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-green-700" aria-hidden="true">
          {currentDays >= 7 ? <Flame size={20} /> : <CircleCheck size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm text-green-800">
            {isComplete
              ? 'Zero Rejection Week — Celebrate!'
              : `${currentDays}-Day Zero Rejection Streak`}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            The team is on a {currentDays}-day Zero Rejection streak!
          </p>
        </div>
        <span
          className="shrink-0 text-lg font-bold text-green-700"
          aria-label={`${currentDays} days`}
        >
          {currentDays}d
        </span>
      </div>

      {/* Progress bar toward 7-day goal */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-green-600 mb-1">
          <span>Day 1</span>
          <span>Goal: 7 days</span>
        </div>
        <div
          className="h-2.5 w-full rounded-full bg-green-200"
          role="progressbar"
          aria-valuenow={currentDays}
          aria-valuemin={0}
          aria-valuemax={7}
          aria-label={`${currentDays} of 7 days`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isComplete ? 'bg-green-500' : 'bg-green-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {!isComplete && (
          <p className="mt-1.5 text-xs text-green-600">
            {7 - currentDays} more day{7 - currentDays !== 1 ? 's' : ''} to earn Zero Rejection Week!
          </p>
        )}
      </div>
    </div>
  )
}

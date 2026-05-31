'use client'

/**
 * AchievementNotification.tsx — Story 51.7: Gamified Team Quality Engagement
 *
 * Non-intrusive toast/banner shown when achievement evaluations produce new awards.
 * Auto-dismisses after 8 seconds. Uses collaborative, celebratory language.
 * Follows the same pattern as LearningNotification (Story 46.2).
 */

import { useEffect, useState } from 'react'
import type { SchedulerRunResult } from '@/lib/achievement-scheduler'

interface AchievementNotificationProps {
  result: SchedulerRunResult | null
  onDismiss: () => void
}

export function AchievementNotification({ result, onDismiss }: AchievementNotificationProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!result) return
    const hasNew =
      result.monthlyAchievements.length > 0 ||
      result.weeklyAchievements.length > 0 ||
      result.milestoneAchievements.length > 0

    if (!hasNew) return

    setVisible(true)
    const timer = setTimeout(() => {
      setVisible(false)
      onDismiss()
    }, 8000)
    return () => clearTimeout(timer)
  }, [result, onDismiss])

  if (!visible || !result) return null

  const totalNew =
    result.monthlyAchievements.length +
    result.weeklyAchievements.length +
    result.milestoneAchievements.length

  // Build a brief summary message
  let message = 'Congratulations!'
  if (result.milestoneAchievements.length > 0) {
    message = result.milestoneAchievements[0]?.description ?? message
  } else if (result.weeklyAchievements.length > 0) {
    message = 'The whole team achieved Zero Rejection Week — celebrate!'
  } else if (result.monthlyAchievements.length > 0) {
    const first = result.monthlyAchievements[0]
    if (first) {
      message = `You earned ${first.type.replace(/_/g, ' ')} this month — great work!`
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="achievement-notification"
      className="fixed bottom-4 start-4 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 p-4 shadow-lg"
    >
      <span className="shrink-0 text-2xl" aria-hidden="true">🏆</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-yellow-900">
          {totalNew === 1 ? 'New Achievement!' : `${totalNew} New Achievements!`}
        </p>
        <p className="mt-0.5 text-xs text-yellow-800">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => { setVisible(false); onDismiss() }}
        className="shrink-0 text-yellow-600 hover:text-yellow-800 text-lg leading-none"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  )
}

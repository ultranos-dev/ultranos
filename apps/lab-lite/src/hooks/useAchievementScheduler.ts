/**
 * useAchievementScheduler.ts — Story 51.7: Gamified Team Quality Engagement
 *
 * React hook that triggers achievement evaluation on mount and once per day.
 * Runs the scheduler only when gamification is enabled.
 * Non-blocking: evaluation runs in the background after mount.
 */

'use client'

import { useEffect } from 'react'
import { runDueEvaluations, type SchedulerRunResult } from '@/lib/achievement-scheduler'
import { useAuthSessionStore } from '@/stores/auth-session-store'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // re-check every hour (milestone checks are daily-gated internally)

export function useAchievementScheduler(
  onNewAchievements?: (result: SchedulerRunResult) => void,
): void {
  const practitionerId = useAuthSessionStore((s) => s.session?.practitionerId)

  useEffect(() => {
    let cancelled = false

    async function runCheck() {
      try {
        const result = await runDueEvaluations(practitionerId ?? undefined)
        const hasNew =
          result.monthlyAchievements.length > 0 ||
          result.weeklyAchievements.length > 0 ||
          result.milestoneAchievements.length > 0

        if (!cancelled && hasNew && onNewAchievements) {
          onNewAchievements(result)
        }
      } catch {
        // Never throw from hook — scheduler failures are non-fatal
      }
    }

    // Run on mount (deferred to avoid blocking initial render)
    const mountTimer = setTimeout(() => {
      void runCheck()
    }, 2000)

    // Re-check periodically (milestone/weekly checks are internally gated by date)
    const interval = setInterval(() => {
      void runCheck()
    }, CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      clearTimeout(mountTimer)
      clearInterval(interval)
    }
  }, [onNewAchievements, practitionerId])
}

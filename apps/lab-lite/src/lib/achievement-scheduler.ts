/**
 * achievement-scheduler.ts — Story 51.7: Gamified Team Quality Engagement
 *
 * Simple timestamp-based scheduler for achievement evaluation.
 * Uses a singleton config in Dexie to prevent duplicate evaluations.
 * All evaluation is local (offline-first — no Hub dependency).
 *
 * Schedule:
 *   - Monthly: evaluated on 1st of month (evaluates previous month)
 *   - Weekly:  evaluated every Monday (evaluates previous week)
 *   - Milestones: checked daily
 */

import {
  getAchievementSchedulerConfig,
  putAchievementSchedulerConfig,
} from './db'
import {
  evaluateMonthlyAchievements,
  evaluateWeeklyAchievements,
  checkTeamMilestones,
  getIsoWeekString,
} from './achievement-service'
import type { Achievement, TeamAchievement } from './db'

export interface SchedulerRunResult {
  monthlyAchievements: Achievement[]
  weeklyAchievements: TeamAchievement[]
  milestoneAchievements: TeamAchievement[]
}

/**
 * Run all due achievement evaluations.
 * Called on app startup and periodically (see useAchievementScheduler).
 * Returns all newly awarded achievements in this run.
 */
export async function runDueEvaluations(): Promise<SchedulerRunResult> {
  const result: SchedulerRunResult = {
    monthlyAchievements: [],
    weeklyAchievements: [],
    milestoneAchievements: [],
  }

  let config = await getAchievementSchedulerConfig()
  if (!config.gamificationEnabled) return result

  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // -------------------------------------------------------------------------
  // Monthly evaluation: run on 1st of month if not already run for prev month
  // Late evaluation: if the scheduler missed the 1st, it runs on next app load
  // -------------------------------------------------------------------------
  const prevMonth = getPreviousMonthString(today)
  if (config.lastMonthlyEvaluation !== prevMonth) {
    try {
      const awards = await evaluateMonthlyAchievements(prevMonth)
      result.monthlyAchievements.push(...awards)
    } catch {
      // Non-fatal: evaluation failure doesn't block app
    }
    config = { ...config, lastMonthlyEvaluation: prevMonth }
    await putAchievementSchedulerConfig(config)
  }

  // -------------------------------------------------------------------------
  // Weekly evaluation: run if last evaluation was not for the previous week
  // -------------------------------------------------------------------------
  const prevWeek = getPreviousWeekString(today)
  if (config.lastWeeklyEvaluation !== prevWeek) {
    try {
      const awards = await evaluateWeeklyAchievements(prevWeek)
      result.weeklyAchievements.push(...awards)
    } catch {
      // Non-fatal
    }
    config = { ...config, lastWeeklyEvaluation: prevWeek }
    await putAchievementSchedulerConfig(config)
  }

  // -------------------------------------------------------------------------
  // Milestone check: run once per day
  // -------------------------------------------------------------------------
  if (config.lastMilestoneCheck !== todayStr) {
    try {
      const awards = await checkTeamMilestones()
      result.milestoneAchievements.push(...awards)
    } catch {
      // Non-fatal
    }
    config = { ...config, lastMilestoneCheck: todayStr }
    await putAchievementSchedulerConfig(config)
  }

  return result
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPreviousMonthString(today: Date): string {
  const d = new Date(today)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getPreviousWeekString(today: Date): string {
  // Get the Monday of the previous week
  const d = new Date(today)
  const dayOfWeek = d.getDay() || 7
  d.setDate(d.getDate() - dayOfWeek - 6) // go back to previous Monday
  return getIsoWeekString(d)
}

/**
 * Check if monthly evaluation is due.
 * Returns true if the scheduler has not yet evaluated the previous month.
 */
export async function isMonthlyEvaluationDue(): Promise<boolean> {
  const config = await getAchievementSchedulerConfig()
  if (!config.gamificationEnabled) return false
  const prevMonth = getPreviousMonthString(new Date())
  return config.lastMonthlyEvaluation !== prevMonth
}

/**
 * Check if weekly evaluation is due.
 */
export async function isWeeklyEvaluationDue(): Promise<boolean> {
  const config = await getAchievementSchedulerConfig()
  if (!config.gamificationEnabled) return false
  const prevWeek = getPreviousWeekString(new Date())
  return config.lastWeeklyEvaluation !== prevWeek
}

/**
 * Check if milestone check is due (once per day).
 */
export async function isMilestoneCheckDue(): Promise<boolean> {
  const config = await getAchievementSchedulerConfig()
  if (!config.gamificationEnabled) return false
  const todayStr = new Date().toISOString().slice(0, 10)
  return config.lastMilestoneCheck !== todayStr
}

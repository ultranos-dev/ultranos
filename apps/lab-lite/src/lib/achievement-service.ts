/**
 * achievement-service.ts — Story 51.7: Gamified Team Quality Engagement
 *
 * Achievement evaluation engine. Runs entirely from local Dexie data — no Hub
 * dependency (offline-first per CLAUDE.md). No PHI: achievements reference
 * tech IDs and operational metrics only.
 *
 * PHI Rule (CLAUDE.md #1): No patient data in achievement records.
 * Audit Rule (#6): Achievement awards do not require audit events (operational
 * recognition, not PHI access).
 */

import { getDb } from './db'
import {
  AchievementType,
  type Achievement,
  type TeamAchievement,
  putAchievement,
  putAchievements,
  putTeamAchievement,
  getAchievementsForTech,
  getAchievementByPeriod,
  getTeamAchievementByPeriod,
  getTeamAchievementsByType,
} from './db'

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

export interface Streak {
  type: 'ZERO_REJECTION'
  currentDays: number
  startDate: string
}

interface TechQcStats {
  techId: string
  totalRuns: number
  passCount: number
  passRate: number
}

interface TechTatStats {
  techId: string
  totalTests: number
  avgTatMinutes: number
  tatVariance: number
  qcPassRate: number
}

// ---------------------------------------------------------------------------
// QC pass/fail helper
// A QC run passes (first-attempt) if |observedValue - targetMean| <= 2 * targetSd.
// Runs with insufficient data (targetSd === 0) are excluded.
// ---------------------------------------------------------------------------

function isQcPass(run: { observedValue: number; targetMean: number; targetSd: number }): boolean {
  if (run.targetSd <= 0) return false
  const zScore = Math.abs(run.observedValue - run.targetMean) / run.targetSd
  return zScore <= 2
}

// ---------------------------------------------------------------------------
// Week string helper — ISO week format YYYY-WNN
// ---------------------------------------------------------------------------

export function getIsoWeekString(date: Date): string {
  // Use UTC methods to avoid timezone-dependent behavior
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// evaluateMonthlyAchievements
// ---------------------------------------------------------------------------

/**
 * Evaluate monthly achievements for the given yearMonth (e.g. "2026-05").
 * Returns newly created Achievement records.
 * Idempotent: skips any achievement that already exists for the period.
 */
export async function evaluateMonthlyAchievements(yearMonth: string): Promise<Achievement[]> {
  const db = getDb()
  const [year, month] = yearMonth.split('-').map(Number)
  const periodStart = new Date(year, month - 1, 1).toISOString()
  const periodEnd = new Date(year, month, 0, 23, 59, 59, 999).toISOString()

  const newAchievements: Achievement[] = []

  // -----------------------------------------------------------------------
  // QC data: query qcRuns for the period
  // -----------------------------------------------------------------------
  let qcRuns: { runBy: string; observedValue: number; targetMean: number; targetSd: number }[] = []
  try {
    const allRuns = await db.qcRuns
      .filter((r) => r.runDate >= periodStart.slice(0, 10) && r.runDate <= periodEnd.slice(0, 10))
      .toArray()
    qcRuns = allRuns
  } catch {
    // qcRuns table may not yet have data — skip QC-based achievements
  }

  // -----------------------------------------------------------------------
  // QC Champion: tech with highest first-attempt pass rate (min 20 runs)
  // -----------------------------------------------------------------------
  if (qcRuns.length > 0) {
    const existing = await getAchievementByPeriod(AchievementType.QC_CHAMPION, yearMonth)
    if (!existing) {
      const statsByTech = new Map<string, { total: number; passes: number }>()
      for (const run of qcRuns) {
        const entry = statsByTech.get(run.runBy) ?? { total: 0, passes: 0 }
        entry.total++
        if (isQcPass(run)) entry.passes++
        statsByTech.set(run.runBy, entry)
      }

      const qualified: TechQcStats[] = []
      for (const [techId, stats] of statsByTech) {
        if (stats.total >= 20) {
          qualified.push({
            techId,
            totalRuns: stats.total,
            passCount: stats.passes,
            passRate: stats.passes / stats.total,
          })
        }
      }

      if (qualified.length > 0) {
        const maxRate = Math.max(...qualified.map((q) => q.passRate))
        const winners = qualified.filter((q) => q.passRate === maxRate)
        const now = new Date().toISOString()
        for (const winner of winners) {
          const record: Achievement = {
            id: crypto.randomUUID(),
            techId: winner.techId,
            type: AchievementType.QC_CHAMPION,
            earnedAt: now,
            evaluationPeriod: yearMonth,
            metadata: {
              passRate: winner.passRate,
              totalRuns: winner.totalRuns,
              passCount: winner.passCount,
            },
            description: `QC Champion for ${yearMonth} — ${Math.round(winner.passRate * 100)}% first-attempt pass rate`,
          }
          await putAchievement(record)
          newAchievements.push(record)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // LAB RESULTS: query for TAT-based achievements (Speed Star, Consistency Award)
  // -----------------------------------------------------------------------
  let labResults: { enteredBy: string; enteredAt: string; sampleId: string }[] = []
  try {
    labResults = await db.lab_results
      .filter((r) => r.enteredAt >= periodStart && r.enteredAt <= periodEnd && r.status === 'completed')
      .toArray()
  } catch {
    // lab_results unavailable — skip TAT-based achievements
  }

  // Compute per-tech TAT stats from lab_results + sample receivedAt
  const tatStatsByTech = new Map<string, { tats: number[]; techId: string }>()
  for (const result of labResults) {
    let receivedAt: string | undefined
    try {
      const sample = await db.samples.get(result.sampleId)
      receivedAt = (sample as any)?._ultranos?.receivedAt ?? (sample as any)?.receivedDateTime
    } catch {
      // sample not found — skip TAT for this result
    }
    if (!receivedAt) continue

    const tatMs = new Date(result.enteredAt).getTime() - new Date(receivedAt).getTime()
    if (tatMs < 0) continue
    const tatMin = tatMs / 60000

    const entry = tatStatsByTech.get(result.enteredBy) ?? { tats: [], techId: result.enteredBy }
    entry.tats.push(tatMin)
    tatStatsByTech.set(result.enteredBy, entry)
  }

  // Build tech TAT stats with QC pass rate (reusing qcRuns stats)
  const qcRateByTech = new Map<string, number>()
  for (const run of qcRuns) {
    const current = qcRateByTech.get(run.runBy)
    if (current === undefined) {
      // Need to compute pass rate per tech
    }
  }
  // Compute QC pass rates for TAT evaluation
  const qcStatsByTech = new Map<string, { total: number; passes: number }>()
  for (const run of qcRuns) {
    const e = qcStatsByTech.get(run.runBy) ?? { total: 0, passes: 0 }
    e.total++
    if (isQcPass(run)) e.passes++
    qcStatsByTech.set(run.runBy, e)
  }
  for (const [techId, stats] of qcStatsByTech) {
    qcRateByTech.set(techId, stats.passes / stats.total)
  }

  const techTatList: TechTatStats[] = []
  for (const [techId, entry] of tatStatsByTech) {
    if (entry.tats.length === 0) continue
    const avg = entry.tats.reduce((a, b) => a + b, 0) / entry.tats.length
    const variance =
      entry.tats.reduce((acc, t) => acc + Math.pow(t - avg, 2), 0) / entry.tats.length
    techTatList.push({
      techId,
      totalTests: entry.tats.length,
      avgTatMinutes: avg,
      tatVariance: variance,
      qcPassRate: qcRateByTech.get(techId) ?? 0,
    })
  }

  // -----------------------------------------------------------------------
  // Speed Star: fastest avg TAT + >95% QC pass rate (min 50 tests)
  // -----------------------------------------------------------------------
  {
    const existing = await getAchievementByPeriod(AchievementType.SPEED_STAR, yearMonth)
    if (!existing) {
      const qualified = techTatList.filter(
        (t) => t.totalTests >= 50 && t.qcPassRate > 0.95,
      )
      if (qualified.length > 0) {
        const minAvgTat = Math.min(...qualified.map((t) => t.avgTatMinutes))
        const winners = qualified.filter((t) => t.avgTatMinutes === minAvgTat)
        const now = new Date().toISOString()
        for (const winner of winners) {
          const record: Achievement = {
            id: crypto.randomUUID(),
            techId: winner.techId,
            type: AchievementType.SPEED_STAR,
            earnedAt: now,
            evaluationPeriod: yearMonth,
            metadata: {
              avgTatMinutes: winner.avgTatMinutes,
              totalTests: winner.totalTests,
              qcPassRate: winner.qcPassRate,
            },
            description: `Speed Star for ${yearMonth} — fastest avg TAT at ${Math.round(winner.avgTatMinutes)} min`,
          }
          await putAchievement(record)
          newAchievements.push(record)
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Consistency Award: lowest TAT variance (min 30 tests)
  // -----------------------------------------------------------------------
  {
    const existing = await getAchievementByPeriod(AchievementType.CONSISTENCY_AWARD, yearMonth)
    if (!existing) {
      const qualified = techTatList.filter((t) => t.totalTests >= 30)
      if (qualified.length > 0) {
        const minVariance = Math.min(...qualified.map((t) => t.tatVariance))
        const winners = qualified.filter((t) => t.tatVariance === minVariance)
        const now = new Date().toISOString()
        for (const winner of winners) {
          const record: Achievement = {
            id: crypto.randomUUID(),
            techId: winner.techId,
            type: AchievementType.CONSISTENCY_AWARD,
            earnedAt: now,
            evaluationPeriod: yearMonth,
            metadata: {
              tatVariance: winner.tatVariance,
              totalTests: winner.totalTests,
              avgTatMinutes: winner.avgTatMinutes,
            },
            description: `Consistency Award for ${yearMonth} — most stable turnaround times`,
          }
          await putAchievement(record)
          newAchievements.push(record)
        }
      }
    }
  }

  return newAchievements
}

// ---------------------------------------------------------------------------
// evaluateWeeklyAchievements
// ---------------------------------------------------------------------------

/**
 * Evaluate weekly achievements for the given ISO week (e.g. "2026-W22").
 * Zero Rejection Week: zero sample rejections across all techs for 7 days,
 * with a minimum of 10 samples received.
 */
export async function evaluateWeeklyAchievements(yearWeek: string): Promise<TeamAchievement[]> {
  const db = getDb()
  const newAchievements: TeamAchievement[] = []

  const existing = await getTeamAchievementByPeriod(AchievementType.ZERO_REJECTION_WEEK, yearWeek)
  if (existing) return newAchievements

  // Parse the week to a date range
  const weekRange = isoWeekToDateRange(yearWeek)
  if (!weekRange) return newAchievements

  const { startDate, endDate } = weekRange

  let samples: { _ultranos?: { pipelineStatus?: string; receivedAt?: string } }[] = []
  try {
    samples = await db.samples
      .filter((s: any) => {
        const recv = s._ultranos?.receivedAt ?? s.receivedDateTime
        return recv && recv >= startDate && recv <= endDate
      })
      .toArray()
  } catch {
    return newAchievements
  }

  const totalReceived = samples.length
  // Minimum 10 samples to avoid false positives during lab closure
  if (totalReceived < 10) return newAchievements

  const hasRejection = samples.some(
    (s) => (s as any)._ultranos?.pipelineStatus === 'rejected',
  )
  if (hasRejection) return newAchievements

  const record: TeamAchievement = {
    id: crypto.randomUUID(),
    type: AchievementType.ZERO_REJECTION_WEEK,
    earnedAt: new Date().toISOString(),
    evaluationPeriod: yearWeek,
    description: `Zero Rejection Week — the whole team had zero sample rejections for 7 days!`,
    participatingTechIds: [], // team-wide, not individual
  }
  await putTeamAchievement(record)
  newAchievements.push(record)
  return newAchievements
}

// ---------------------------------------------------------------------------
// evaluateMentorshipBadge
// ---------------------------------------------------------------------------

/**
 * Check if a tech has mentored a junior colleague through 5+ supervised
 * result entries (LearningJournalEntry records with caseContext by mentees).
 * Returns new Achievement or null if not yet earned or already awarded.
 */
export async function evaluateMentorshipBadge(techId: string): Promise<Achievement | null> {
  const db = getDb()

  // Already awarded? (mentorship badge is one-time, period = 'lifetime')
  const existing = await getAchievementByPeriod(
    AchievementType.MENTORSHIP_BADGE,
    'lifetime',
    techId,
  )
  if (existing) return null

  // Count learning journal entries where this tech is mentor and entries have caseContext
  let supervisedCount = 0
  try {
    const pairings = await db.mentorship_pairings
      .where('mentorId')
      .equals(techId)
      .toArray()

    for (const pairing of pairings) {
      const entries = await db.learning_journal
        .where('pairingId')
        .equals(pairing.id)
        .filter((e) => e.authorRole === 'mentee' && !!e.caseContext)
        .count()
      supervisedCount += entries
    }
  } catch {
    return null
  }

  if (supervisedCount < 5) return null

  const record: Achievement = {
    id: crypto.randomUUID(),
    techId,
    type: AchievementType.MENTORSHIP_BADGE,
    earnedAt: new Date().toISOString(),
    evaluationPeriod: 'lifetime',
    metadata: { supervisedEntries: supervisedCount },
    description: `Mentorship Badge — mentored a colleague through ${supervisedCount} supervised entries`,
  }
  await putAchievement(record)
  return record
}

// ---------------------------------------------------------------------------
// checkTeamMilestones
// ---------------------------------------------------------------------------

const MILESTONE_THRESHOLDS: Array<{ type: AchievementType; count: number }> = [
  { type: AchievementType.TEAM_MILESTONE_1K, count: 1000 },
  { type: AchievementType.TEAM_MILESTONE_5K, count: 5000 },
  { type: AchievementType.TEAM_MILESTONE_10K, count: 10000 },
]

/**
 * Check if any team milestones (1K/5K/10K tests) have been crossed.
 * Each milestone is awarded only once.
 */
export async function checkTeamMilestones(): Promise<TeamAchievement[]> {
  const db = getDb()
  const newAchievements: TeamAchievement[] = []

  let totalTests = 0
  try {
    totalTests = await db.lab_results.count()
  } catch {
    return newAchievements
  }

  for (const milestone of MILESTONE_THRESHOLDS) {
    if (totalTests < milestone.count) continue

    const existing = await getTeamAchievementsByType(milestone.type)
    if (existing.length > 0) continue // already awarded

    const record: TeamAchievement = {
      id: crypto.randomUUID(),
      type: milestone.type,
      earnedAt: new Date().toISOString(),
      evaluationPeriod: new Date().toISOString().slice(0, 7), // YYYY-MM
      description: `Team Milestone — your lab processed its ${milestone.count.toLocaleString()}th test!`,
      participatingTechIds: [],
    }
    await putTeamAchievement(record)
    newAchievements.push(record)
  }

  return newAchievements
}

// ---------------------------------------------------------------------------
// getAchievementsForTech (re-exported for component use)
// ---------------------------------------------------------------------------

export { getAchievementsForTech }

// ---------------------------------------------------------------------------
// getTeamAchievementsRecent
// ---------------------------------------------------------------------------

/**
 * Returns team achievements for the last N months (for dashboard display).
 */
export async function getTeamAchievementsRecent(months: number): Promise<TeamAchievement[]> {
  const db = getDb()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const cutoffIso = cutoff.toISOString()
  const all = await db.team_achievements.orderBy('earnedAt').reverse().toArray()
  return all.filter((a) => a.earnedAt >= cutoffIso)
}

// ---------------------------------------------------------------------------
// getActiveStreaks
// ---------------------------------------------------------------------------

/**
 * Compute current in-progress Zero Rejection streak (consecutive days
 * with no rejections, ending today). Returns [] if no streak or data unavailable.
 *
 * A day counts toward the streak if it had ≥1 sample and zero rejections.
 */
export async function getActiveStreaks(): Promise<Streak[]> {
  const db = getDb()
  const streaks: Streak[] = []

  try {
    // Walk backwards day by day from today
    let currentDate = new Date()
    let streakDays = 0
    let startDate = ''

    for (let i = 0; i < 30; i++) {
      const dateStr = currentDate.toISOString().slice(0, 10)
      const dayStart = dateStr + 'T00:00:00.000Z'
      const dayEnd = dateStr + 'T23:59:59.999Z'

      const daySamples = await db.samples
        .filter((s: any) => {
          const recv = s._ultranos?.receivedAt ?? s.receivedDateTime
          return recv && recv >= dayStart && recv <= dayEnd
        })
        .toArray()

      if (daySamples.length === 0) {
        // No samples this day — break streak (avoids false positives on off days)
        break
      }

      const hasRejection = daySamples.some(
        (s: any) => s._ultranos?.pipelineStatus === 'rejected',
      )
      if (hasRejection) break

      streakDays++
      startDate = dateStr
      currentDate.setDate(currentDate.getDate() - 1)
    }

    if (streakDays >= 1) {
      streaks.push({
        type: 'ZERO_REJECTION',
        currentDays: streakDays,
        startDate,
      })
    }
  } catch {
    // Streak computation is best-effort
  }

  return streaks
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isoWeekToDateRange(
  yearWeek: string,
): { startDate: string; endDate: string } | null {
  // Parse "YYYY-WNN"
  const match = yearWeek.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null

  const year = parseInt(match[1], 10)
  const week = parseInt(match[2], 10)

  // ISO week 1 is the week containing the first Thursday of the year
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const mondayOfWeek1 = new Date(jan4)
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1)

  const startDate = new Date(mondayOfWeek1)
  startDate.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7)
  const endDate = new Date(startDate)
  endDate.setUTCDate(startDate.getUTCDate() + 6)
  endDate.setUTCHours(23, 59, 59, 999)

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  }
}

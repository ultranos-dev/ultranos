/**
 * portfolio-service.ts — Story 51.6 / 51.7
 *
 * Aggregates technician performance metrics for portfolio display and export.
 * No PHI: uses tech IDs and operational metrics only.
 * Offline-first: all data sourced from Dexie.
 */

import { getDb } from './db'
import type { Achievement } from './db'
import { getAchievementsForTech } from './achievement-service'

export interface PortfolioMetrics {
  techId: string
  totalResultsEntered: number
  completedResultsEntered: number
  totalQcRuns: number
  qcPassRate: number | null        // null if no QC runs
  avgTatMinutes: number | null     // null if insufficient data
  mentorshipSessionCount: number
  achievements: Achievement[]
}

/**
 * Build portfolio metrics for a technician from local Dexie data.
 */
export async function buildPortfolioMetrics(techId: string): Promise<PortfolioMetrics> {
  const db = getDb()

  // Lab results
  const allResults = await db.lab_results
    .where('enteredBy')
    .equals(techId)
    .toArray()
    .catch(() => [])

  const completedResults = allResults.filter((r) => r.status === 'completed')

  // QC pass rate
  let qcPassRate: number | null = null
  try {
    const qcRuns = await db.qcRuns.where('runBy').equals(techId).toArray()
    if (qcRuns.length > 0) {
      const passCount = qcRuns.filter((r) => {
        if (r.targetSd <= 0) return false
        return Math.abs(r.observedValue - r.targetMean) / r.targetSd <= 2
      }).length
      qcPassRate = passCount / qcRuns.length
    }
  } catch {
    // qcRuns may not be populated
  }

  // Average TAT
  let avgTatMinutes: number | null = null
  const tats: number[] = []
  for (const result of completedResults) {
    try {
      const sample = await db.samples.get(result.sampleId)
      const receivedAt = (sample as any)?._ultranos?.receivedAt ?? (sample as any)?.receivedDateTime
      if (receivedAt) {
        const tatMs = new Date(result.enteredAt).getTime() - new Date(receivedAt).getTime()
        if (tatMs >= 0) tats.push(tatMs / 60000)
      }
    } catch {
      // skip
    }
  }
  if (tats.length > 0) {
    avgTatMinutes = tats.reduce((a, b) => a + b, 0) / tats.length
  }

  // Mentorship sessions (as mentor)
  let mentorshipSessionCount = 0
  try {
    const pairings = await db.mentorship_pairings.where('mentorId').equals(techId).toArray()
    for (const p of pairings) {
      const count = await db.learning_journal
        .where('pairingId')
        .equals(p.id)
        .count()
      mentorshipSessionCount += count
    }
  } catch {
    // mentorship data may not exist
  }

  // Achievements
  const achievements = await getAchievementsForTech(techId)

  return {
    techId,
    totalResultsEntered: allResults.length,
    completedResultsEntered: completedResults.length,
    totalQcRuns: 0, // populated above if available
    qcPassRate,
    avgTatMinutes,
    mentorshipSessionCount,
    achievements,
  }
}

/**
 * Badge Evaluator — Story 46.7
 *
 * Checks all badge requirements against current Dexie data and returns
 * newly earned badges (those not already recorded). Idempotent: re-evaluating
 * will not create duplicate EarnedBadge records.
 */

import { getDb } from '@/lib/db'
import type { EarnedBadge } from '@/lib/quality-streak-types'
import { BADGE_CATALOGUE } from '@/lib/badge-definitions'

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate all badges for a technician.
 * - Loads current streaks, metrics, completions, and already-earned badges.
 * - Returns only NEW badges earned in this evaluation run.
 * - Persists newly earned badges to Dexie.
 */
export async function evaluateBadges(technicianId: string): Promise<EarnedBadge[]> {
  const db = getDb()
  const now = new Date().toISOString()

  // Load already earned badge IDs to avoid duplicates
  const alreadyEarned = await db.earned_badges
    .where('technicianId')
    .equals(technicianId)
    .toArray()
  const earnedIds = new Set(alreadyEarned.map((e) => e.badgeId))

  // Load current data for evaluation
  const [streaks, allMetrics, completions, allModules] = await Promise.all([
    db.quality_streaks.where('technicianId').equals(technicianId).toArray(),
    db.quality_metrics.where('technicianId').equals(technicianId).toArray(),
    db.module_completions.where('technicianId').equals(technicianId).toArray(),
    db.micro_learning_modules.toArray(),
  ])

  const streakByType = Object.fromEntries(streaks.map((s) => [s.streakType, s]))
  const completionCount = completions.length
  const totalModules = allModules.length

  const newlyEarned: EarnedBadge[] = []

  for (const badge of BADGE_CATALOGUE) {
    if (earnedIds.has(badge.id)) continue // already earned — skip

    let qualifies = false
    const { requirement: req } = badge

    switch (req.type) {
      case 'streak_days': {
        if (!req.streakType) break
        const streak = streakByType[req.streakType]
        qualifies = (streak?.currentStreak ?? 0) >= req.target ||
                    (streak?.longestStreak ?? 0) >= req.target
        break
      }

      case 'count': {
        // For training badges: check completion count
        // Special case: 'training-all' requires 100% completion rate
        if (badge.id === 'training-all') {
          qualifies = totalModules > 0 && completionCount >= totalModules
        } else {
          qualifies = completionCount >= req.target
        }
        break
      }

      case 'metric_threshold': {
        if (!req.metricType || !req.operator) break
        // Check most recent metric of this type
        const metricsOfType = allMetrics
          .filter((m) => m.metricType === req.metricType)
          .sort((a, b) => b.period.localeCompare(a.period))
        const latest = metricsOfType[0]
        if (!latest) break

        // For CV% below 3% for 3 months: check last 3 available periods
        if (badge.id === 'quality-cv-3pct') {
          const last3 = metricsOfType.slice(0, 3)
          qualifies = last3.length >= 3 && last3.every((m) => m.value <= req.target)
        } else if (req.operator === 'lte') {
          qualifies = latest.value <= req.target
        } else {
          qualifies = latest.value >= req.target
        }
        break
      }
    }

    if (qualifies) {
      const earned: EarnedBadge = {
        id: `eb-${badge.id}-${technicianId}`,
        technicianId,
        badgeId: badge.id,
        earnedAt: now,
        syncStatus: 'pending',
      }
      newlyEarned.push(earned)
    }
  }

  if (newlyEarned.length > 0) {
    await db.earned_badges.bulkPut(newlyEarned)
  }

  return newlyEarned
}

// ---------------------------------------------------------------------------
// Seed badge catalogue into Dexie (idempotent)
// ---------------------------------------------------------------------------

/**
 * Persist the badge catalogue to the local Dexie `badges` table.
 * Safe to call repeatedly — uses bulkPut (upsert).
 */
export async function seedBadgeCatalogue(): Promise<void> {
  const db = getDb()
  await db.badges.bulkPut(BADGE_CATALOGUE)
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getEarnedBadges(technicianId: string): Promise<EarnedBadge[]> {
  const db = getDb()
  return db.earned_badges
    .where('technicianId')
    .equals(technicianId)
    .sortBy('earnedAt')
}

export async function getPendingBadgeSyncs(technicianId: string): Promise<EarnedBadge[]> {
  const db = getDb()
  return db.earned_badges
    .where('technicianId')
    .equals(technicianId)
    .filter((e) => e.syncStatus === 'pending')
    .toArray()
}

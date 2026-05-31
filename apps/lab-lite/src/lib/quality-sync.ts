/**
 * Quality Sync — Story 46.7
 *
 * Syncs quality streaks, monthly metrics, and earned badges to the Hub as
 * part of the technician's professional development record.
 *
 * Sync is opportunistic and non-blocking: if the Hub is unreachable, data
 * stays in Dexie with syncStatus='pending' and is retried next time.
 *
 * No PHI is included in sync payloads — all data is aggregate quality
 * metrics and professional development records about the technician themselves.
 */

import { getDb } from '@/lib/db'
import { getTrpcClient } from '@/lib/trpc'
import type { QualityStreak, QualityMetric, EarnedBadge } from '@/lib/quality-streak-types'

// ---------------------------------------------------------------------------
// Payload types (aligned with Hub API schema for professional dev records)
// ---------------------------------------------------------------------------

export interface QualityProfilePayload {
  technicianId: string
  streaks: Array<{
    streakType: string
    currentStreak: number
    longestStreak: number
    updatedAt: string
  }>
  metrics: Array<{
    metricType: string
    period: string
    value: number
    unit: string
    trend: string
  }>
  earnedBadges: Array<{
    badgeId: string
    earnedAt: string
  }>
}

// ---------------------------------------------------------------------------
// Sync implementation
// ---------------------------------------------------------------------------

/**
 * Sync all pending quality data to the Hub.
 * Safe to call repeatedly — idempotent at the Dexie level.
 * Returns the number of records synced.
 */
export async function syncQualityProfile(technicianId: string): Promise<number> {
  const db = getDb()

  const [streaks, allMetrics, pendingBadges] = await Promise.all([
    db.quality_streaks.where('technicianId').equals(technicianId).toArray(),
    db.quality_metrics.where('technicianId').equals(technicianId).toArray(),
    db.earned_badges
      .where('technicianId')
      .equals(technicianId)
      .filter((e) => e.syncStatus === 'pending')
      .toArray(),
  ])

  if (streaks.length === 0 && allMetrics.length === 0 && pendingBadges.length === 0) {
    return 0
  }

  const payload: QualityProfilePayload = {
    technicianId,
    streaks: streaks.map((s) => ({
      streakType: s.streakType,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      updatedAt: s.updatedAt,
    })),
    metrics: allMetrics.map((m) => ({
      metricType: m.metricType,
      period: m.period,
      value: m.value,
      unit: m.unit,
      trend: m.trend,
    })),
    earnedBadges: pendingBadges.map((e) => ({
      badgeId: e.badgeId,
      earnedAt: e.earnedAt,
    })),
  }

  try {
    const trpc = getTrpcClient()
    await trpc.lab.syncQualityProfile.mutate(payload)

    // Mark badges as synced
    if (pendingBadges.length > 0) {
      const ids = pendingBadges.map((e) => e.id)
      await db.transaction('rw', db.earned_badges, async () => {
        for (const id of ids) {
          await db.earned_badges.update(id, { syncStatus: 'synced' as const })
        }
      })
    }

    return streaks.length + allMetrics.length + pendingBadges.length
  } catch {
    // Network unavailable — data stays pending, will retry next sync cycle
    return 0
  }
}

/**
 * Check if there are any pending badge syncs for a technician.
 */
export async function hasPendingQualitySync(technicianId: string): Promise<boolean> {
  const db = getDb()
  const count = await db.earned_badges
    .where('technicianId')
    .equals(technicianId)
    .filter((e) => e.syncStatus === 'pending')
    .count()
  return count > 0
}

/**
 * Quality Streak & Achievement System Types — Story 46.7
 *
 * Fully offline-capable: all data lives in Dexie. No PHI — all data is
 * operational/professional-development data about the technician's own
 * quality metrics. Quality data is aggregated; no patient data appears.
 */

// ---------------------------------------------------------------------------
// QualityStreak — consecutive day counters
// ---------------------------------------------------------------------------

export type QualityStreakType = 'qc_passing' | 'zero_rejection'

export interface QualityStreak {
  id: string
  technicianId: string
  streakType: QualityStreakType
  currentStreak: number         // consecutive days (resets on failure)
  longestStreak: number         // all-time best
  lastResetAt: string | null    // ISO date when the streak last broke
  lastResetReason: string | null // human-readable explanation (no PHI)
  updatedAt: string             // ISO 8601
}

// ---------------------------------------------------------------------------
// QualityMetric — monthly performance indicators
// ---------------------------------------------------------------------------

export type MetricTrend = 'improving' | 'stable' | 'declining'

export interface QualityMetric {
  id: string
  technicianId: string
  metricType: string   // e.g. 'hemoglobin_cv', 'turnaround_time', 'rejection_rate'
  period: string       // e.g. '2026-05' (YYYY-MM)
  value: number
  unit: string         // e.g. '%', 'minutes', 'count'
  trend: MetricTrend
  updatedAt: string    // ISO 8601
}

// ---------------------------------------------------------------------------
// Badge — static catalogue entries (defined in badge-definitions.ts)
// ---------------------------------------------------------------------------

export type BadgeCategory = 'streak' | 'training' | 'quality' | 'milestone'
export type BadgeRequirementType = 'streak_days' | 'count' | 'metric_threshold'

export interface BadgeRequirement {
  type: BadgeRequirementType
  streakType?: QualityStreakType
  /** Target value: days for streak_days, count for count, metric value for metric_threshold */
  target: number
  /** For metric_threshold: which metricType to check */
  metricType?: string
  /** For metric_threshold: operator — 'lte' means value <= target is good */
  operator?: 'lte' | 'gte'
}

export interface Badge {
  id: string
  name: string
  description: string
  icon: string          // lucide icon name or emoji fallback
  category: BadgeCategory
  requirement: BadgeRequirement
}

// ---------------------------------------------------------------------------
// EarnedBadge — per-technician achievement records
// ---------------------------------------------------------------------------

export type BadgeSyncStatus = 'pending' | 'synced'

export interface EarnedBadge {
  id: string
  technicianId: string
  badgeId: string
  earnedAt: string      // ISO 8601
  syncStatus: BadgeSyncStatus
}

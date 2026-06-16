/**
 * Story 48.2 — Predictive Reagent Burndown Engine
 *
 * Pure computation module — no React, no side effects.
 * All inputs come from Dexie; all calculations are fully offline.
 *
 * Timezone note: daysUntilDepletion uses Math.floor (not Math.round) to avoid
 * threshold boundary flips caused by sub-day UTC offsets (e.g. Afghanistan UTC+4:30).
 */

import { getConsumptionLogForBurndown } from './db'
import type { AlertLevel } from './db'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ConsumptionRate {
  averageDailyUsage: number
  unit: string
  dataPointCount: number
  confidenceLevel: 'high' | 'medium' | 'low'
}

export interface BurndownResult {
  reagentId: string
  reagentName: string
  currentStock: number
  unit: string
  expiryDate: string
  consumptionRate: ConsumptionRate
  usageDepletionDate: Date | null
  effectiveDepletionDate: Date
  depletionReason: 'usage' | 'expiry'
  reorderDate: Date
  daysRemaining: number
  alertLevel: AlertLevel
  supplierLeadTimeDays: number
  supplierName?: string
}

// Re-exported for Story 54.6 Seasonal Planner compatibility
export interface BurndownProjection {
  reagentId: string
  projectedDepletionDate: string | null
  confidenceLevel: 'high' | 'medium' | 'low'
}

// ---------------------------------------------------------------------------
// calculateDailyConsumptionRate
// ---------------------------------------------------------------------------

/**
 * Calculate the average daily consumption rate for a reagent using historical data.
 *
 * Algorithm:
 *   totalConsumed = sum(quantityUsed) over the lookback window
 *   daysInWindow  = min(daysSinceFirstEntry, lookbackDays)
 *   dailyRate     = totalConsumed / daysInWindow
 *
 * Returns zero rate when no data exists.
 * Confidence: high (>=14 data points), medium (7-13), low (<7).
 */
export async function calculateDailyConsumptionRate(
  reagentId: string,
  lookbackDays = 30,
): Promise<ConsumptionRate> {
  const entries = await getConsumptionLogForBurndown(reagentId, lookbackDays)

  if (entries.length === 0) {
    return { averageDailyUsage: 0, unit: '', dataPointCount: 0, confidenceLevel: 'low' }
  }

  const unit = entries[0]!.unit
  const totalConsumed = entries.reduce((sum, e) => sum + e.quantityUsed, 0)

  // Window = time from first entry to now, capped at lookbackDays
  const firstEntryDate = new Date(entries[0]!.consumedAt)
  const now = new Date()
  const daysSinceFirst = (now.getTime() - firstEntryDate.getTime()) / 86400000
  const daysInWindow = Math.min(Math.max(daysSinceFirst, 1), lookbackDays)

  const averageDailyUsage = totalConsumed / daysInWindow

  const dataPointCount = entries.length
  const confidenceLevel: ConsumptionRate['confidenceLevel'] =
    dataPointCount >= 14 ? 'high' : dataPointCount >= 7 ? 'medium' : 'low'

  return { averageDailyUsage, unit, dataPointCount, confidenceLevel }
}

// ---------------------------------------------------------------------------
// projectUsageDepletionDate
// ---------------------------------------------------------------------------

/**
 * Project the date at which current stock will be exhausted.
 * Returns null if daily rate is 0 (no consumption) or stock is already 0.
 */
export function projectUsageDepletionDate(
  currentStock: number,
  dailyRate: number,
): Date | null {
  if (dailyRate <= 0 || currentStock <= 0) return null
  const daysRemaining = Math.ceil(currentStock / dailyRate)
  const depletion = new Date()
  depletion.setDate(depletion.getDate() + daysRemaining)
  // Normalize to midnight UTC to avoid sub-day drift
  depletion.setUTCHours(0, 0, 0, 0)
  return depletion
}

// ---------------------------------------------------------------------------
// getEffectiveDepletionDate
// ---------------------------------------------------------------------------

/**
 * Return whichever comes first: usage-based depletion or chemical expiry.
 * If usage depletion is null (zero rate), returns the expiry date.
 */
export function getEffectiveDepletionDate(
  usageDepletion: Date | null,
  expiryDate: Date,
): { date: Date; reason: 'usage' | 'expiry' } {
  if (usageDepletion === null) return { date: expiryDate, reason: 'expiry' }
  if (usageDepletion <= expiryDate) return { date: usageDepletion, reason: 'usage' }
  return { date: expiryDate, reason: 'expiry' }
}

// ---------------------------------------------------------------------------
// calculateReorderDate
// ---------------------------------------------------------------------------

/**
 * Calculate the recommended reorder date: effectiveDepletion - leadTimeDays.
 * If the computed date is in the past, returns today (already overdue).
 */
export function calculateReorderDate(
  effectiveDepletion: Date,
  leadTimeDays: number,
  today: Date = new Date(),
): Date {
  const reorder = new Date(effectiveDepletion)
  reorder.setDate(reorder.getDate() - leadTimeDays)
  return reorder < today ? new Date(today) : reorder
}

// ---------------------------------------------------------------------------
// evaluateAlertThreshold
// ---------------------------------------------------------------------------

/**
 * Determine the alert level based on days until effective depletion.
 * Thresholds (inclusive): <=7 → critical, <=14 → warning, <=30 → info, >30 → none.
 * Uses Math.floor to avoid spurious threshold flips at sub-day UTC offsets.
 */
export function evaluateAlertThreshold(
  effectiveDepletion: Date,
  today: Date = new Date(),
): AlertLevel {
  const days = daysUntilDepletion(effectiveDepletion, today)
  if (days <= 7) return 'critical'
  if (days <= 14) return 'warning'
  if (days <= 30) return 'info'
  return 'none'
}

// ---------------------------------------------------------------------------
// daysUntilDepletion
// ---------------------------------------------------------------------------

/**
 * Return the number of whole days between today and the effective depletion date.
 * Negative values mean the reagent is already overdue.
 * Uses Math.floor to be conservative — never overstates remaining days.
 */
export function daysUntilDepletion(effectiveDepletion: Date, today: Date = new Date()): number {
  return Math.floor((effectiveDepletion.getTime() - today.getTime()) / 86400000)
}

// ---------------------------------------------------------------------------
// getBurndownProjections — Story 54.6 Seasonal Planner compatibility shim
// ---------------------------------------------------------------------------

/**
 * Returns burndown projections for all active reagents.
 * Used by Story 54.6 (Seasonal Planner) via dynamic import with graceful fallback.
 */
export async function getBurndownProjections(): Promise<BurndownProjection[]> {
  const { getActiveReagents } = await import('./db')
  const reagents = await getActiveReagents()

  const projections: BurndownProjection[] = []
  for (const reagent of reagents) {
    const currentStock = Math.max(0, reagent.expectedTests - reagent.testsPerformed)
    const rate = await calculateDailyConsumptionRate(reagent.reagentId)
    const usageDepletion = projectUsageDepletionDate(currentStock, rate.averageDailyUsage)

    let effectiveDate: string | null = null
    try {
      const expiry = new Date(reagent.expiryDate)
      if (!isNaN(expiry.getTime())) {
        const { date } = getEffectiveDepletionDate(usageDepletion, expiry)
        effectiveDate = date.toISOString()
      }
    } catch {
      // malformed expiry — leave effectiveDate null
    }

    projections.push({
      reagentId: reagent.reagentId,
      projectedDepletionDate: effectiveDate,
      confidenceLevel: rate.confidenceLevel,
    })
  }
  return projections
}

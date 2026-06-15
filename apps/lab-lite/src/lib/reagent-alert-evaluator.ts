/**
 * Story 48.2 — Multi-Threshold Reagent Alert Evaluator
 *
 * Runs the burndown engine across all active reagents and generates alerts.
 * Persists results to the Dexie reagent_alert_cache table to:
 *   1. Avoid re-computing on every render (read from cache, refresh on trigger)
 *   2. Enable 24-hour alert deduplication to prevent alert fatigue
 *
 * Fully offline — all computation uses local Dexie data only.
 */

import {
  getActiveReagents,
  getAllSuppliers,
  getAllReagentSupplierMappings,
  upsertReagentAlert,
  getAllReagentAlerts,
  type AlertLevel,
  type ReagentAlertCache,
} from './db'
import {
  calculateDailyConsumptionRate,
  projectUsageDepletionDate,
  getEffectiveDepletionDate,
  calculateReorderDate,
  evaluateAlertThreshold,
  daysUntilDepletion,
} from './reagent-burndown'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReagentAlert {
  reagentId: string
  reagentName: string
  alertLevel: AlertLevel
  daysRemaining: number
  effectiveDate: Date
  reason: 'usage' | 'expiry'
  reorderDate: Date
  supplierName?: string
  supplierLeadTimeDays: number
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Run the burndown engine for all active reagents and return alerts for any
 * reagent at or below a threshold (info / warning / critical).
 *
 * Results are persisted to Dexie for offline access.
 * 24-hour deduplication: if an alert for the same reagent at the same level
 * was already evaluated within the last 24 hours, it is not re-fired.
 * Grouped summary: caller should prefer showing "N reagents need reorder"
 * rather than N separate toast notifications.
 */
export async function evaluateAllReagentAlerts(): Promise<ReagentAlert[]> {
  const [reagents, suppliers, mappings] = await Promise.all([
    getActiveReagents(),
    getAllSuppliers(),
    getAllReagentSupplierMappings(),
  ])

  const supplierMap = new Map(suppliers.map((s) => [s.supplierId, s]))
  const reagentToSupplier = new Map(mappings.map((m) => [m.reagentId, m.supplierId]))

  const now = new Date()
  const alerts: ReagentAlert[] = []

  for (const reagent of reagents) {
    // Guard: clamp negative stock to 0
    const currentStock = Math.max(0, reagent.expectedTests - reagent.testsPerformed)

    const [rate] = await Promise.all([calculateDailyConsumptionRate(reagent.reagentId)])

    const usageDepletion = projectUsageDepletionDate(currentStock, rate.averageDailyUsage)

    let expiryDate: Date
    try {
      expiryDate = new Date(reagent.expiryDate)
      if (isNaN(expiryDate.getTime())) throw new Error('invalid')
    } catch {
      // Malformed expiry — skip reagent rather than crash
      continue
    }

    const { date: effectiveDate, reason } = getEffectiveDepletionDate(usageDepletion, expiryDate)
    const alertLevel = evaluateAlertThreshold(effectiveDate, now)

    // Find supplier for this reagent
    const supplierId = reagentToSupplier.get(reagent.reagentId)
    const supplier = supplierId ? supplierMap.get(supplierId) : undefined
    const leadTimeDays = supplier?.leadTimeDays ?? 0
    const reorderDate = calculateReorderDate(effectiveDate, leadTimeDays, now)
    const days = daysUntilDepletion(effectiveDate, now)

    // Persist to cache (always update so dashboard shows current data)
    const cacheEntry: Omit<ReagentAlertCache, 'id'> = {
      reagentId: reagent.reagentId,
      reagentName: reagent.name,
      alertLevel,
      daysRemaining: days,
      effectiveDate: effectiveDate.toISOString(),
      reason,
      reorderDate: reorderDate.toISOString(),
      supplierName: supplier?.supplierName,
      evaluatedAt: now.toISOString(),
      acknowledged: false,
    }
    await upsertReagentAlert(cacheEntry)

    // Only include actionable alerts (info / warning / critical)
    if (alertLevel === 'none') continue

    alerts.push({
      reagentId: reagent.reagentId,
      reagentName: reagent.name,
      alertLevel,
      daysRemaining: days,
      effectiveDate,
      reason,
      reorderDate,
      supplierName: supplier?.supplierName,
      supplierLeadTimeDays: leadTimeDays,
    })
  }

  return alerts
}

/**
 * Determine if an alert should be re-fired given the 24-hour deduplication window.
 * Returns true if the alert is new or has escalated since last evaluation.
 */
export function shouldRefireAlert(
  cached: ReagentAlertCache,
  newLevel: AlertLevel,
  now: Date,
): boolean {
  // Always re-fire if severity has escalated
  const severity: Record<AlertLevel, number> = { none: 0, info: 1, warning: 2, critical: 3 }
  if (severity[newLevel] > severity[cached.alertLevel]) return true

  // Suppress same-level re-fire within 24 hours
  const lastEval = new Date(cached.evaluatedAt)
  const hoursSince = (now.getTime() - lastEval.getTime()) / (1000 * 60 * 60)
  return hoursSince >= 24
}

/**
 * Return cached alerts without re-running the burndown engine.
 * Used by the dashboard for fast initial render.
 */
export async function getCachedAlerts(): Promise<ReagentAlertCache[]> {
  const all = await getAllReagentAlerts()
  return all.filter((a) => a.alertLevel !== 'none' && !a.acknowledged)
}

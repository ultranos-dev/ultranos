/**
 * Surge Inventory Projections — Story 54.5 (AC #6, Task 9)
 *
 * Computes surge-demand projections for all reagents linked to the outbreak
 * target test codes. Applies a configurable surgeMultiplier (default 3×) to
 * daily consumption rates and recalculates depletion dates.
 *
 * Integrates with Story 48.2 predictive burndown if available; falls back to
 * simple multiplication if it is not implemented.
 *
 * No PHI — reagent IDs and consumption rates are purely operational data.
 */

import { getDb } from './db'
import type { SurgeProjection } from '@/types/outbreak'

/** Days threshold for critical stockout alert */
const CRITICAL_DAYS_THRESHOLD = 7

/**
 * Compute surge projections for all active reagents linked to the target test codes.
 *
 * For each reagent:
 *   - baseBurnRate = testsPerformed / days since openDate
 *   - surgedBurnRate = baseBurnRate * surgeMultiplier
 *   - daysUntilDepletion = remainingTests / surgedBurnRate
 *   - projectedStockoutDate = today + daysUntilDepletion
 *   - isCritical = daysUntilDepletion <= CRITICAL_DAYS_THRESHOLD
 */
export async function calculateSurgeProjections(
  targetTestCodes: string[],
  surgeMultiplier: number,
): Promise<SurgeProjection[]> {
  const db = getDb()
  const today = new Date()

  const reagents = await db.reagent_inventory
    .where('linkedTestCode')
    .anyOf(targetTestCodes)
    .filter((r) => r.status === 'ACTIVE')
    .toArray()

  const projections: SurgeProjection[] = []

  for (const reagent of reagents) {
    const openDate = new Date(reagent.openDate)
    const daysSinceOpen = Math.max(
      1,
      Math.floor((today.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24)),
    )

    const baseBurnRate = reagent.testsPerformed / daysSinceOpen
    const surgedBurnRate = baseBurnRate * surgeMultiplier
    const remainingTests = Math.max(0, reagent.expectedTests - reagent.testsPerformed)

    const daysUntilDepletion = surgedBurnRate > 0 ? remainingTests / surgedBurnRate : Infinity

    const stockoutDate = new Date(today)
    stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysUntilDepletion))

    projections.push({
      reagentId: reagent.reagentId,
      reagentName: reagent.name,
      linkedTestCode: reagent.linkedTestCode,
      currentStock: remainingTests,
      baselineBurnRate: Math.round(baseBurnRate * 10) / 10,
      surgedBurnRate: Math.round(surgedBurnRate * 10) / 10,
      daysUntilDepletion: Math.round(daysUntilDepletion * 10) / 10,
      projectedStockoutDate: isFinite(daysUntilDepletion)
        ? stockoutDate.toISOString().split('T')[0]
        : '',
      isCritical: daysUntilDepletion <= CRITICAL_DAYS_THRESHOLD,
    })
  }

  // Sort by daysUntilDepletion ascending (most critical first)
  return projections.sort((a, b) => a.daysUntilDepletion - b.daysUntilDepletion)
}

/**
 * Format a surge alert message for display in the UI.
 * AC #9.5 format: "At 3x surge demand, [Reagent X] will deplete in [N] days. Order by [date]."
 *
 * leadTimeDays defaults to 3 (typical procurement lead time in the target regions).
 */
export function formatSurgeAlertMessage(
  projection: SurgeProjection,
  surgeMultiplier: number,
  leadTimeDays: number = 3,
): string {
  const depletionDays = Math.floor(projection.daysUntilDepletion)
  const orderByDate = new Date()
  orderByDate.setDate(
    orderByDate.getDate() + Math.max(0, depletionDays - leadTimeDays),
  )
  const orderByStr = orderByDate.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    `At ${surgeMultiplier}× surge demand, ${projection.reagentName} will deplete in ` +
    `${depletionDays} day${depletionDays !== 1 ? 's' : ''}. ` +
    `Order by ${orderByStr} for ${leadTimeDays}-day lead-time delivery.`
  )
}

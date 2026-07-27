/**
 * Daily Situation Report (Sitrep) generator — Story 54.5
 *
 * Computes aggregate metrics from local Dexie data for the target outbreak.
 * All metrics are counts and rates — no PHI (CLAUDE.md Rule #1).
 *
 * Auto-generation: triggered at configurable time (default 18:00 local)
 * or on-demand via manual trigger from SitrepView.
 */

import { hlc, serializeHlc } from './hlc'
import { getDb, addDailySitrep } from './db'
import type { OutbreakModeConfig, DailySitrep } from '@/types/outbreak'

// Default auto-generation hour (18:00 local time)
export const DEFAULT_SITREP_HOUR = 18

/**
 * Compute today's ISO date string in local time (YYYY-MM-DD).
 */
function getTodayLocalDate(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Determine if a lab result is positive.
 * Checks the result's interpretation code: 'POS', 'POSITIVE', 'H' (high), or
 * the _ultranos extension field resultInterpretation.
 */
function isPositiveResult(result: Record<string, unknown>): boolean {
  // Check interpretation array (FHIR DiagnosticReport/Observation)
  const interpretation = result.interpretation as Array<{ coding?: Array<{ code?: string }> }> | undefined
  if (Array.isArray(interpretation)) {
    for (const item of interpretation) {
      for (const coding of item.coding ?? []) {
        const code = coding.code?.toUpperCase()
        if (code === 'POS' || code === 'POSITIVE' || code === 'H' || code === 'A') {
          return true
        }
      }
    }
  }

  // Fallback: check _ultranos extension
  const ultranos = result._ultranos as Record<string, unknown> | undefined
  const interp = ultranos?.resultInterpretation
  if (typeof interp === 'string') {
    const upper = interp.toUpperCase()
    if (upper === 'POSITIVE' || upper === 'POS' || upper === 'ABNORMAL') return true
  }

  return false
}

/**
 * Compute the reagent burn rate (units/day) and projected stockout date
 * for the most critically-depleting reagent linked to the target test codes.
 *
 * Returns { burnRate: 0, projectedStockoutDate: null } if no reagents found.
 */
async function computeReagentMetrics(
  targetTestCodes: string[],
  surgeMultiplier: number,
): Promise<{ burnRate: number; projectedStockoutDate: string | null }> {
  const db = getDb()
  const reagents = await db.reagent_inventory
    .where('linkedTestCode')
    .anyOf(targetTestCodes)
    .filter((r) => r.status === 'ACTIVE')
    .toArray()

  if (reagents.length === 0) {
    return { burnRate: 0, projectedStockoutDate: null }
  }

  // Compute daily burn rate per reagent: testsPerformed / days since openDate
  let criticalDaysUntilDepletion = Infinity
  let criticalBurnRate = 0
  let criticalStockoutDate: string | null = null
  const today = new Date()

  for (const reagent of reagents) {
    const openDate = new Date(reagent.openDate)
    const daysSinceOpen = Math.max(
      1,
      Math.floor((today.getTime() - openDate.getTime()) / (1000 * 60 * 60 * 24)),
    )
    const baseBurnRate = reagent.testsPerformed / daysSinceOpen
    const surgedBurnRate = baseBurnRate * surgeMultiplier
    const remainingTests = reagent.expectedTests - reagent.testsPerformed

    if (surgedBurnRate <= 0) continue

    const daysUntilDepletion = remainingTests / surgedBurnRate
    if (daysUntilDepletion < criticalDaysUntilDepletion) {
      criticalDaysUntilDepletion = daysUntilDepletion
      criticalBurnRate = surgedBurnRate

      const stockoutDate = new Date(today)
      stockoutDate.setDate(stockoutDate.getDate() + Math.floor(daysUntilDepletion))
      criticalStockoutDate = stockoutDate.toISOString().split('T')[0]
    }
  }

  return {
    burnRate: Math.round(criticalBurnRate * 10) / 10,
    projectedStockoutDate: criticalDaysUntilDepletion > 30 ? null : criticalStockoutDate,
  }
}

/**
 * Generate a daily sitrep for the given outbreak config.
 *
 * Queries local Dexie for today's results filtered to target test codes,
 * computes all required metrics, persists the sitrep, and returns it.
 *
 * generatedBy: 'system' for auto-generation, or a practitioner ID for manual.
 */
export async function generateDailySitrep(
  outbreakConfig: OutbreakModeConfig,
  options?: { generatedBy?: string; reportDate?: string },
): Promise<DailySitrep> {
  const db = getDb()
  const reportDate = options?.reportDate ?? getTodayLocalDate()
  const generatedBy = options?.generatedBy ?? 'system'

  // Query today's lab results matching target test codes
  const allResults = await db.lab_results
    .where('loincCode')
    .anyOf(outbreakConfig.targetTestCodes)
    .toArray()

  // Filter to results entered today
  const todayResults = allResults.filter((r) => {
    const enteredAt = (r as Record<string, unknown>).enteredAt as string | undefined
    return enteredAt?.startsWith(reportDate)
  })

  const totalTestsPerformed = todayResults.length
  const positiveCount = todayResults.filter((r) =>
    isPositiveResult(r as Record<string, unknown>),
  ).length

  const positivityRate =
    totalTestsPerformed > 0
      ? Math.round((positiveCount / totalTestsPerformed) * 1000) / 10
      : 0

  // Pending samples (received today, not yet resulted)
  const pendingSamples = await db.samples
    .filter((s) => {
      const status = (s._ultranos as Record<string, unknown>)?.pipelineStatus as string | undefined
      return status === 'received' || status === 'in_progress'
    })
    .count()

  const { burnRate, projectedStockoutDate } = await computeReagentMetrics(
    outbreakConfig.targetTestCodes,
    outbreakConfig.surgeMultiplier,
  )

  const now = serializeHlc(hlc.now())
  const sitrep: DailySitrep = {
    id: crypto.randomUUID(),
    outbreakConfigId: outbreakConfig.id,
    reportDate,
    totalTestsPerformed,
    positiveCount,
    positivityRate,
    reagentBurnRate: burnRate,
    projectedStockoutDate,
    pendingSamples,
    generatedAt: now,
    generatedBy,
    syncStatus: 'pending',
  }

  await addDailySitrep(sitrep)
  return sitrep
}

// ---------------------------------------------------------------------------
// Auto-generation scheduler
// ---------------------------------------------------------------------------

let _schedulerTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Calculate milliseconds until next auto-generation time (default: 18:00 local).
 */
function msUntilNextGeneration(hour: number = DEFAULT_SITREP_HOUR): number {
  const now = new Date()
  const target = new Date()
  target.setHours(hour, 0, 0, 0)

  if (target <= now) {
    // Already past today's target — schedule for tomorrow
    target.setDate(target.getDate() + 1)
  }

  return target.getTime() - now.getTime()
}

/**
 * Start the auto-generation scheduler.
 * Fires at the configured hour, generates a sitrep for the active outbreak,
 * then reschedules for the next day.
 *
 * Returns a cleanup function to cancel the scheduled generation.
 */
export function startSitrepScheduler(
  getActiveConfig: () => Promise<OutbreakModeConfig | null>,
  options?: { hour?: number },
): () => void {
  const hour = options?.hour ?? DEFAULT_SITREP_HOUR

  async function schedule(): Promise<void> {
    const ms = msUntilNextGeneration(hour)
    _schedulerTimer = setTimeout(async () => {
      try {
        const config = await getActiveConfig()
        if (config) {
          await generateDailySitrep(config, { generatedBy: 'system' })
        }
      } catch {
        // Sitrep generation failure must not crash the app
      }
      schedule()
    }, ms)
  }

  schedule()

  return () => {
    if (_schedulerTimer) {
      clearTimeout(_schedulerTimer)
      _schedulerTimer = null
    }
  }
}

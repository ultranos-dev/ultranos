/**
 * reagent-waste-service.ts — Story 44.3
 *
 * Pure calculation functions for reagent waste, consumption efficiency, and
 * expiry projection. Zero side effects — no Dexie access, no state mutations.
 * Callers load data from Dexie and pass it in.
 */

import type { ReagentInventoryEntry, ReagentConsumptionEntry } from './db'
import { ReagentStatus } from './db'

// ---------------------------------------------------------------------------
// Efficiency & waste metrics
// ---------------------------------------------------------------------------

/**
 * Consumption efficiency for a single reagent unit.
 * Returns value in range [0, 1] (multiply by 100 for %).
 * Returns 0 if expectedTests is 0 (guard against division by zero).
 */
export function calculateConsumptionEfficiency(
  entry: ReagentInventoryEntry,
): number {
  if (entry.expectedTests <= 0) return 0
  return Math.min(entry.testsPerformed / entry.expectedTests, 1)
}

/**
 * Overall waste rate across a set of disposed/expired reagent entries.
 * Waste rate = sum(remainingAtDisposal) / sum(expectedTests).
 * Only considers DEPLETED / EXPIRED / DISPOSED entries with non-null remainingAtDisposal.
 * Returns 0 if no applicable entries exist.
 */
export function calculateWasteRate(entries: ReagentInventoryEntry[]): number {
  const disposed = entries.filter(
    (e) =>
      e.status !== ReagentStatus.ACTIVE &&
      e.remainingAtDisposal !== null,
  )
  if (disposed.length === 0) return 0

  const totalRemaining = disposed.reduce(
    (sum, e) => sum + (e.remainingAtDisposal ?? 0),
    0,
  )
  const totalExpected = disposed.reduce((sum, e) => sum + e.expectedTests, 0)
  if (totalExpected <= 0) return 0
  return totalRemaining / totalExpected
}

/**
 * Total financial loss from wasted reagents.
 * Loss per unit = (remainingAtDisposal / expectedTests) * costPerUnit
 * Only counts DEPLETED / EXPIRED / DISPOSED entries.
 */
export function calculateFinancialLoss(entries: ReagentInventoryEntry[]): number {
  return entries
    .filter(
      (e) =>
        e.status !== ReagentStatus.ACTIVE &&
        e.remainingAtDisposal !== null &&
        e.remainingAtDisposal > 0,
    )
    .reduce((sum, e) => {
      const lossRatio = (e.remainingAtDisposal ?? 0) / e.expectedTests
      return sum + lossRatio * e.costPerUnit
    }, 0)
}

/**
 * Financial loss for disposed reagents whose disposalDate falls within a period.
 * Only counts actual losses (disposalDate in range) — never projects active reagents.
 */
export function calculateFinancialLossByPeriod(
  entries: ReagentInventoryEntry[],
  startDate: string,
  endDate: string,
): number {
  const inPeriod = entries.filter(
    (e) =>
      e.status !== ReagentStatus.ACTIVE &&
      e.disposalDate !== null &&
      e.disposalDate >= startDate &&
      e.disposalDate <= endDate &&
      e.remainingAtDisposal !== null &&
      e.remainingAtDisposal > 0,
  )
  return calculateFinancialLoss(inPeriod)
}

// ---------------------------------------------------------------------------
// Expiry projection
// ---------------------------------------------------------------------------

export interface ExpiryProjection {
  /** Estimated tests remaining unused at expiry date (rounded up). */
  projectedRemainingAtExpiry: number
  /** Estimated financial loss if this projection holds. */
  projectedFinancialLoss: number
  /** Daily consumption rate used (tests/day). */
  dailyRate: number
  /** Days until expiry from today. */
  daysUntilExpiry: number
}

/**
 * Project whether an ACTIVE reagent will expire before it is depleted.
 *
 * Algorithm:
 *   dailyRate = totalConsumed / daysSinceOpen (14-day rolling window preferred)
 *   daysUntilExpiry = expiryDate - today (date-only, midnight local time)
 *   remaining = expectedTests - testsPerformed
 *   projectedConsumedBeforeExpiry = dailyRate * daysUntilExpiry
 *   projectedRemainingAtExpiry = remaining - projectedConsumedBeforeExpiry
 *
 * Returns:
 *   - null if reagent will be depleted before expiry (no alert needed)
 *   - null if there is "insufficient data" (opened < 3 days ago or no log entries)
 *   - ExpiryProjection if projected waste > 0
 *
 * @param entry - The ACTIVE reagent inventory entry
 * @param consumptionLog - All consumption log entries for this reagent
 * @param today - ISO 8601 date string (YYYY-MM-DD) — caller provides to keep function pure
 */
export function projectExpiryBeforeDepletion(
  entry: ReagentInventoryEntry,
  consumptionLog: ReagentConsumptionEntry[],
  today: string,
): ExpiryProjection | null {
  // Only project ACTIVE reagents
  if (entry.status !== ReagentStatus.ACTIVE) return null

  const todayDate = parseLocalDate(today)
  const openDate = parseLocalDate(entry.openDate)
  const expiryDate = parseLocalDate(entry.expiryDate)

  const daysSinceOpen = diffDays(openDate, todayDate)
  const daysUntilExpiry = diffDays(todayDate, expiryDate)

  // Already expired — no projection needed
  if (daysUntilExpiry <= 0) return null

  // Insufficient data: opened < 3 days ago
  if (daysSinceOpen < 3) return null

  // No consumption log entries — insufficient data
  if (consumptionLog.length === 0) return null

  // Calculate daily rate using 14-day rolling window (or all history if < 14 days)
  const windowStart = new Date(todayDate)
  windowStart.setDate(windowStart.getDate() - 14)
  const windowStartStr = toDateString(windowStart)

  const windowEntries = consumptionLog.filter(
    (e) => e.loggedAt.slice(0, 10) >= windowStartStr,
  )
  const entriesForRate = windowEntries.length > 0 ? windowEntries : consumptionLog

  const totalConsumedInWindow = entriesForRate.reduce(
    (sum, e) => sum + e.testsConsumed,
    0,
  )

  // Days covered by window entries
  const oldestInWindow = entriesForRate.reduce(
    (min, e) => (e.loggedAt < min ? e.loggedAt : min),
    entriesForRate[0].loggedAt,
  )
  const windowDays = Math.max(
    1,
    diffDays(parseLocalDate(oldestInWindow.slice(0, 10)), todayDate),
  )

  const dailyRate = totalConsumedInWindow / windowDays

  const remaining = entry.expectedTests - entry.testsPerformed
  const projectedConsumedBeforeExpiry = dailyRate * daysUntilExpiry
  const projectedRemainingAtExpiry = remaining - projectedConsumedBeforeExpiry

  if (projectedRemainingAtExpiry <= 0) return null

  const projectedFinancialLoss =
    (projectedRemainingAtExpiry / entry.expectedTests) * entry.costPerUnit

  return {
    projectedRemainingAtExpiry: Math.ceil(projectedRemainingAtExpiry),
    projectedFinancialLoss,
    dailyRate,
    daysUntilExpiry,
  }
}

// ---------------------------------------------------------------------------
// Alert generation
// ---------------------------------------------------------------------------

export interface ExpiryAlert {
  reagentId: string
  reagentName: string
  openDate: string
  expiryDate: string
  remainingTests: number
  projectedFinancialLoss: number
  daysUntilExpiry: number
  /** 'warning' = > 14 days until expiry; 'critical' = <= 14 days */
  severity: 'warning' | 'critical'
  linkedTestCode: string
}

/**
 * Generate a structured expiry alert from an entry and its projection.
 * Returns the alert object (localization of the message is done in the UI layer
 * using the finance.reagent.alerts.expiryWarning i18n key with interpolation).
 */
export function generateExpiryAlert(
  entry: ReagentInventoryEntry,
  projection: ExpiryProjection,
): ExpiryAlert {
  return {
    reagentId: entry.reagentId,
    reagentName: entry.name,
    openDate: entry.openDate,
    expiryDate: entry.expiryDate,
    remainingTests: projection.projectedRemainingAtExpiry,
    projectedFinancialLoss: projection.projectedFinancialLoss,
    daysUntilExpiry: projection.daysUntilExpiry,
    severity: projection.daysUntilExpiry <= 14 ? 'critical' : 'warning',
    linkedTestCode: entry.linkedTestCode,
  }
}

// ---------------------------------------------------------------------------
// Date helpers (no external dependencies)
// ---------------------------------------------------------------------------

/** Parse a YYYY-MM-DD date string to a local midnight Date. */
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** Difference in whole days: end - start (positive = end is in the future). */
function diffDays(start: Date, end: Date): number {
  const MS_PER_DAY = 86_400_000
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY)
}

/** Format a Date as YYYY-MM-DD. */
function toDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

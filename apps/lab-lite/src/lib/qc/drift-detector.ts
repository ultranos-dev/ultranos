/**
 * Drift Detection Orchestrator — Story 43.6
 *
 * Main entry point for analyzing QC data and producing drift alerts.
 * Fetches the last 20 QC runs from Dexie, runs all Westgard rules + trend detection,
 * and creates DriftAlert entries for any violations.
 *
 * Key behaviors:
 * - Per-instrument, per-analyte, per-control-level analysis (pitfall #2, #3)
 * - Deduplication: no duplicate alerts for the same active (unacknowledged) violation (pitfall #4)
 * - Fully offline: all logic runs from Dexie data only (pitfall #5)
 */

import type { DriftAlert, QcControlLevel, WestgardRule } from './types'
import { runAllWestgardRules } from './westgard-rules'
import { detectTrend } from './trend-detector'
import { getDb } from '@/lib/db'

const HISTORY_LIMIT = 20

/**
 * Analyze QC runs for a specific analyte/instrument combination and produce drift alerts.
 *
 * Analyzes each control level (LEVEL_1, LEVEL_2, LEVEL_3) independently.
 * Creates new DriftAlert records for any violations not already active.
 * Returns all currently active (unacknowledged) alerts sorted by severity.
 *
 * @param analyte     - Analyte name (e.g. "Hemoglobin")
 * @param instrumentId - Opaque instrument/analyzer ID
 */
export async function analyzeDrift(
  analyte: string,
  instrumentId: string,
): Promise<DriftAlert[]> {
  const db = getDb()
  const controlLevels: QcControlLevel[] = ['LEVEL_1', 'LEVEL_2', 'LEVEL_3']

  for (const controlLevel of controlLevels) {
    // Fetch last 20 QC runs for this analyte/instrument/level, ordered oldest → newest
    const runs = await db.qcRuns
      .where('[analyte+instrumentId+controlLevel]')
      .equals([analyte, instrumentId, controlLevel])
      .sortBy('runDate')

    const recentRuns = runs.slice(-HISTORY_LIMIT)
    if (recentRuns.length === 0) continue

    // All runs should share the same target mean/SD (from the same control lot insert)
    // Use the most recent run's values as the reference
    const { targetMean, targetSd, loincCode } = recentRuns[recentRuns.length - 1]
    const observedValues = recentRuns.map((r) => r.observedValue)

    // Run all Westgard rules
    const violations = runAllWestgardRules(observedValues, targetMean, targetSd)

    // Run trend detection
    const trend = detectTrend(observedValues)
    if (trend) {
      violations.push({
        violated: true,
        rule: 'TREND_5',
        message: `${analyte} QC trending ${trend.direction === 'UP' ? 'high' : 'low'} for ${trend.consecutiveCount} consecutive runs. Recommend recalibration before processing patient samples.`,
        severity: 'WARNING',
        consecutiveCount: trend.consecutiveCount,
      })
    }

    // Fetch existing unacknowledged alerts for deduplication
    const existingAlerts = await db.driftAlerts
      .where('[analyte+instrumentId+controlLevel]')
      .equals([analyte, instrumentId, controlLevel])
      .filter((a) => a.acknowledgedAt === null)
      .toArray()

    for (const violation of violations) {
      // Deduplication check: skip if same rule already has an unacknowledged alert
      const alreadyActive = existingAlerts.some((a) => a.ruleViolated === violation.rule)
      if (alreadyActive) continue

      const alert: DriftAlert = {
        id: crypto.randomUUID(),
        analyte,
        loincCode,
        instrumentId,
        controlLevel,
        ruleViolated: violation.rule,
        severity: violation.severity,
        message: buildAlertMessage(analyte, violation.rule, violation.consecutiveCount, violation.message),
        consecutiveCount: violation.consecutiveCount,
        detectedAt: new Date().toISOString(),
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolution: null,
        resolutionNotes: null,
      }

      await db.driftAlerts.add(alert)
    }
  }

  // Return all currently active (unacknowledged) alerts for this analyte/instrument, severity-sorted
  const activeAlerts = await db.driftAlerts
    .where('[analyte+instrumentId+controlLevel]')
    .between(
      [analyte, instrumentId, 'LEVEL_1'],
      [analyte, instrumentId, 'LEVEL_3'],
      true,
      true,
    )
    .filter((a) => a.acknowledgedAt === null)
    .toArray()

  return sortBySeverity(activeAlerts)
}

/**
 * Acknowledge a drift alert with a resolution.
 * Sets acknowledgedAt, acknowledgedBy, resolution, and resolutionNotes.
 */
export async function acknowledgeDriftAlert(
  alertId: string,
  acknowledgedBy: string,
  resolution: DriftAlert['resolution'],
  resolutionNotes: string | null = null,
): Promise<void> {
  const db = getDb()
  await db.driftAlerts.update(alertId, {
    acknowledgedAt: new Date().toISOString(),
    acknowledgedBy,
    resolution,
    resolutionNotes,
  })
}

/**
 * Get all active (unacknowledged) drift alerts across all analytes.
 * Used by the dashboard banner to show global alert state.
 */
export async function getAllActiveDriftAlerts(): Promise<DriftAlert[]> {
  const db = getDb()
  const all = await db.driftAlerts.filter((a) => a.acknowledgedAt === null).toArray()
  return sortBySeverity(all)
}

/**
 * Get drift alert history for a specific analyte/instrument (all alerts, including acknowledged).
 * Used by QcHistoryView to show the full alert log.
 */
export async function getDriftAlertHistory(
  analyte: string,
  instrumentId: string,
): Promise<DriftAlert[]> {
  const db = getDb()
  return db.driftAlerts
    .where('[analyte+instrumentId+controlLevel]')
    .between(
      [analyte, instrumentId, 'LEVEL_1'],
      [analyte, instrumentId, 'LEVEL_3'],
      true,
      true,
    )
    .reverse()
    .sortBy('detectedAt')
    .then((results) => results.reverse())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortBySeverity(alerts: DriftAlert[]): DriftAlert[] {
  return [...alerts].sort((a, b) => {
    // REJECT before WARNING
    if (a.severity === 'REJECT' && b.severity !== 'REJECT') return -1
    if (b.severity === 'REJECT' && a.severity !== 'REJECT') return 1
    // Within same severity, most recent first
    return b.detectedAt.localeCompare(a.detectedAt)
  })
}

function buildAlertMessage(
  analyte: string,
  rule: WestgardRule,
  consecutiveCount: number,
  ruleMessage: string,
): string {
  // For TREND_5, the ruleMessage already has the full AC #1 format
  if (rule === 'TREND_5') return ruleMessage
  return ruleMessage
}

/**
 * QC Advisory Flag Propagation — Story 43.6
 *
 * When a patient result is saved for an analyte with an active drift alert,
 * a QC advisory flag is attached to the result in the _ultranos namespace.
 *
 * This is a second layer on top of Story 43.2's QC snapshot:
 * - 43.2: "Here's what QC status was when this result was produced"
 * - 43.6: "Warning — QC was drifting when this result was produced"
 *
 * The advisory flag does NOT carry any PHI — it references only the alertId
 * and a standard message string (CLAUDE.md Rule #1).
 */

import type { DriftAlert } from './types'
import { getDb } from '@/lib/db'

/**
 * Check if there is an active (unacknowledged) drift alert for a given
 * analyte/instrument combination.
 *
 * Returns the most severe active alert (REJECT > WARNING), or null if none exists.
 * This is called before saving a patient result.
 */
export async function getActiveAdvisory(
  analyte: string,
  instrumentId: string,
): Promise<DriftAlert | null> {
  const db = getDb()

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

  if (activeAlerts.length === 0) return null

  // Return most severe: REJECT before WARNING
  const rejectAlert = activeAlerts.find((a) => a.severity === 'REJECT')
  return rejectAlert ?? activeAlerts[0]
}

/**
 * Build the QC advisory annotation to attach to a patient result.
 *
 * The annotation is placed in _ultranos.qcAdvisory on the result object.
 * Contains only: alertId (opaque) and the standard message string.
 * NEVER contains the actual drift value, patient data, or analyte result.
 *
 * @param alert - The active drift alert for this analyte/instrument
 */
export function buildQcAdvisoryAnnotation(alert: DriftAlert): {
  alertId: string
  message: string
  ruleViolated: string
  severity: string
  detectedAt: string
} {
  return {
    alertId: alert.id,
    message: 'QC advisory — produced during drift warning',
    ruleViolated: alert.ruleViolated,
    severity: alert.severity,
    detectedAt: alert.detectedAt,
  }
}

/**
 * Check for an active advisory and return the annotation if one exists.
 * Returns null if no active drift alert exists (result has clean QC status).
 *
 * This is the primary integration hook for the result save flow (Story 42.4).
 *
 * Usage in result entry page:
 *   const advisory = await checkAndBuildAdvisory(analyte, instrumentId)
 *   if (advisory) {
 *     result._ultranos = { ...result._ultranos, qcAdvisory: advisory }
 *   }
 */
export async function checkAndBuildAdvisory(
  analyte: string,
  instrumentId: string,
): Promise<ReturnType<typeof buildQcAdvisoryAnnotation> | null> {
  const alert = await getActiveAdvisory(analyte, instrumentId)
  if (!alert) return null
  return buildQcAdvisoryAnnotation(alert)
}

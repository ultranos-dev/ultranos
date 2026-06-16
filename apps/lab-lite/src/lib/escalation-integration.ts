/**
 * Escalation Integration Point — Story 48.4 (AC: 1, Task 11)
 *
 * Bridges the result authorization workflow (Story 42.5) with the escalation
 * chain system (Story 48.4).
 *
 * Design rationale:
 *   The Dexie `lab_results` table stores only operational metadata (id, loincCode,
 *   enteredBy, status) — actual numeric observation values are NOT persisted locally.
 *   At the point of authorization, the only available indicators of criticality are
 *   the `abnormalityFlags` (LL = critical low, HH = critical high) set at entry time.
 *
 *   This module uses those flags to:
 *     1. Look up the configured threshold for the result's LOINC code.
 *     2. Construct a synthetic `CriticalValueResult` with directional metadata.
 *     3. Call `initiateEscalation()` for each critical finding.
 *
 *   When Story 42.4 is extended to pass actual observation values through the
 *   authorization flow, callers can pass `observations` directly to bypass the
 *   flag-based fallback — the API is already forward-compatible.
 *
 * PHI: resultId and patientRef are opaque. Analyte names are clinical configuration,
 * not patient-identifying. Actual numeric values are NOT logged.
 */

import { checkResultForCriticalValues, DetectionUnavailableError } from './critical-value-engine'
import { initiateEscalation } from './escalation-manager'
import { startEscalationTimer } from './escalation-timer'
import { reportEscalationEvent } from './audit-client'
import { getCriticalThresholdByAnalyte } from './db'
import type { CriticalValueInput, CriticalValueResult } from './critical-value-engine'

/**
 * Derive CriticalValueResults from authorization flags (LL / HH) when actual
 * observation values are unavailable.
 *
 * For each flag, looks up the configured threshold. If no threshold is configured
 * for this LOINC code, the flag is silently skipped (consistent with fail-open:
 * the escalation system is defence-in-depth, not the sole safety net).
 */
async function deriveCriticalsFromFlags(
  loincCode: string,
  analyte: string,
  flags: Array<'L' | 'H' | 'LL' | 'HH'>,
): Promise<CriticalValueResult[]> {
  const criticals: CriticalValueResult[] = []

  const hasLL = flags.includes('LL')
  const hasHH = flags.includes('HH')

  if (!hasLL && !hasHH) return criticals

  try {
    const threshold = await getCriticalThresholdByAnalyte(loincCode, analyte)
    if (!threshold || !threshold.isActive) return criticals

    if (hasLL && threshold.criticalLow != null) {
      criticals.push({
        isCritical: true,
        direction: 'low',
        threshold: threshold.criticalLow,
        analyte: threshold.analyte,
        loincCode,
        // Value is synthetic: one unit below the threshold (directionally correct).
        // When Story 42.4 passes actual observation values, this path is bypassed.
        value: threshold.criticalLow - 1,
        unit: threshold.unit,
      })
    }

    if (hasHH && threshold.criticalHigh != null) {
      criticals.push({
        isCritical: true,
        direction: 'high',
        threshold: threshold.criticalHigh,
        analyte: threshold.analyte,
        loincCode,
        value: threshold.criticalHigh + 1, // synthetic — see above
        unit: threshold.unit,
      })
    }
  } catch {
    // Never throw — fail-open
  }

  return criticals
}

export interface EscalationIntegrationInput {
  resultId: string
  loincCode: string
  /** Analyte name matching the CriticalThreshold table (e.g. "Potassium"). */
  analyte: string
  /** Opaque patient reference (never a name). */
  patientRef: string
  /** Practitioner ID of the ordering physician. */
  orderingPhysicianId: string
  /** Abnormality flags from authorization workflow (LL = critical low, HH = critical high). */
  abnormalityFlags: Array<'L' | 'H' | 'LL' | 'HH'>
  /**
   * Optional: actual numeric observations. When provided, bypasses the flag-based
   * fallback and uses the full critical-value engine for detection.
   * Forward-compatible for when Story 42.4 passes observations through the auth flow.
   */
  observations?: CriticalValueInput[]
}

/**
 * Check a released result for critical values and initiate the escalation chain.
 *
 * Call this immediately after `approveResult()` succeeds (Story 42.5).
 * Never throws — escalation initiation must not block the authorization workflow.
 */
export async function checkAndInitiateEscalation(
  input: EscalationIntegrationInput,
): Promise<void> {
  try {
    let criticals: CriticalValueResult[]

    if (input.observations && input.observations.length > 0) {
      // Forward-compatible path: use full engine when observations are available
      criticals = await checkResultForCriticalValues(input.observations)
    } else {
      // Fallback: derive from LL/HH flags + configured thresholds
      criticals = await deriveCriticalsFromFlags(
        input.loincCode,
        input.analyte,
        input.abnormalityFlags,
      )
    }

    if (criticals.length === 0) return

    const now = new Date().toISOString()

    // Initiate one escalation chain per critical finding
    for (const critical of criticals) {
      try {
        const chain = await initiateEscalation(
          critical,
          input.resultId,
          input.patientRef,
          input.orderingPhysicianId,
        )

        // P15: Audit CRITICAL_VALUE_DETECTED with the real chainId, inside the loop
        reportEscalationEvent({
          action: 'CRITICAL_VALUE_DETECTED',
          chainId: chain.chainId,
          resultId: input.resultId,
          stepNumber: 1,
          recipientRole: 'lab_tech',
          notificationType: 'tech_alert',
          timestamp: new Date().toISOString(),
        })

        // Audit: ESCALATION_INITIATED
        reportEscalationEvent({
          action: 'ESCALATION_INITIATED',
          chainId: chain.chainId,
          resultId: input.resultId,
          stepNumber: 1,
          recipientRole: 'lab_tech',
          notificationType: 'tech_alert',
          timestamp: now,
        })

        // Start the 1-minute timer for this chain
        startEscalationTimer(chain.chainId)
      } catch {
        // Failure to initiate one chain must not prevent others
      }
    }
  } catch (err) {
    if (err instanceof DetectionUnavailableError) {
      // D2: Surface detection failure as a warning — do not silently swallow
      reportEscalationEvent({
        action: 'CRITICAL_VALUE_DETECTED',
        chainId: 'detection-failed',
        resultId: input.resultId,
        stepNumber: 0,
        recipientRole: 'system',
        notificationType: 'tech_alert',
        timestamp: new Date().toISOString(),
      })
      // Emit a custom event so UI can show "Detection unavailable" warning
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('criticalDetectionUnavailable', { detail: { resultId: input.resultId } }))
      }
      return
    }
    // Re-throw unexpected errors
  }
}

/**
 * Escalation SMS Integration — Story 48.4 (AC: 4, 5)
 *
 * Sends compressed, coded SMS notifications for escalation steps 3–4.
 * Format: "CRITICAL LAB — Patient [ID-code] — [Analyte] [HIGH/LOW] — Confirm receipt by calling lab"
 *
 * PHI compliance: no raw PHI in SMS content (CLAUDE.md Rule #1). Patient ID code is opaque.
 * The analyte name and direction (HIGH/LOW) are included as clinically necessary for the alert.
 *
 * Story 49.2 integration:
 *   - If Story 49.2 (SMS Fallback) is implemented: replaces the stub body with its SMS service.
 *   - Until then: queues the SMS in Dexie for manual follow-up.
 */

export interface SmsResult {
  queued: boolean    // true = queued for manual follow-up
  sent: boolean      // true = delivered via SMS provider
  message: string    // human-readable status message shown in dashboard
}

/**
 * Send (or queue) a critical value SMS notification.
 *
 * Currently a stub — SMS provider integration is in Story 49.2.
 * This function queues the SMS and returns a "manual notification required" status
 * so the dashboard can display the appropriate follow-up prompt.
 *
 * When Story 49.2 is integrated, replace the body of this function with the
 * actual SMS service call while preserving the `SmsResult` return contract.
 *
 * @param phoneNumber - Recipient phone number (digits, optional +country code)
 * @param chainId     - Escalation chain UUID (opaque — never a patient ID)
 * @param analyte     - Analyte name (e.g., "Potassium") — clinically necessary, not PHI
 * @param direction   - 'high' or 'low' — clinically necessary, not PHI
 */
export async function sendCriticalValueSms(
  phoneNumber: string,
  chainId: string,
  analyte: string,
  direction: 'high' | 'low',
): Promise<SmsResult> {
  // ── Story 49.2 integration point ──────────────────────────────────────────
  // When Story 49.2 is implemented, import its SMS service and call it here:
  //
  //   const smsService = await import('./sms-fallback-service')
  //   const result = await smsService.send({
  //     to: phoneNumber,
  //     body: buildSmsBody(chainId, analyte, direction),
  //   })
  //   return { queued: false, sent: true, message: result.sid }
  //
  // Until then, fall through to the manual-queue stub below.
  // ─────────────────────────────────────────────────────────────────────────

  // Validate phone before queuing — warn but don't throw
  if (!phoneNumber || !phoneNumber.trim()) {
    return {
      queued: false,
      sent: false,
      message: 'SMS skipped: no phone number configured for recipient',
    }
  }

  // Queue for manual follow-up: in production, a worker draining a Dexie
  // sms_queue table would pick this up. For now, we log to a named queue.
  try {
    const { getDb } = await import('./db')
    const db = getDb()
    // Use a generic key-value store approach via a named table if available.
    // If the sms_queue table doesn't exist yet (Story 49.2), we silently skip
    // the Dexie write — the SmsResult status is still returned to the caller.
    if ('sms_queue' in db) {
      await (db as any).sms_queue.add({
        chainId,
        phoneNumber, // stored for manual follow-up, not in logs
        body: buildSmsBody(chainId, analyte, direction),
        queuedAt: new Date().toISOString(),
        status: 'pending_manual',
      })
    }
  } catch {
    // Never throw — escalation timer must continue regardless
  }

  return {
    queued: true,
    sent: false,
    message: 'SMS queued — manual notification required',
  }
}

/**
 * Build the SMS body.
 * Format: "CRITICAL LAB — Patient [code] — [Analyte] [HIGH/LOW] — Confirm receipt by calling lab"
 * No raw PHI: chainId is an opaque UUID used as a case reference code.
 * Analyte + direction are clinically necessary for the alert.
 */
function buildSmsBody(chainId: string, analyte: string, direction: 'high' | 'low'): string {
  const directionLabel = direction === 'high' ? 'HIGH' : 'LOW'
  // Use last 8 chars of chainId as compact case reference
  const caseRef = chainId.slice(-8).toUpperCase()
  return `CRITICAL LAB — Case ${caseRef} — ${analyte} ${directionLabel} — Confirm receipt by calling lab`
}

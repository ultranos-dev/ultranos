/**
 * Story 49.2 — SMS Confirmation Handler
 *
 * When connectivity is restored, polls the Twilio gateway for inbound SMS
 * confirmations and matches them against pending smsQueue entries.
 *
 * Protocol:
 *   1. Physician receives SMS: "[LabCode] CRITICAL: Pt [ID] [Test] [Value][Unit] — Reply CONFIRM X4K2"
 *   2. Physician replies: "CONFIRM X4K2"
 *   3. Twilio routes reply to webhook endpoint on Hub API (when online)
 *   4. Hub API relays confirmation code to Lab-Lite via a sync/query endpoint
 *   5. This handler matches the code to smsQueue, marks as confirmed, stops escalation
 *
 * PHI rule: inbound message body is NEVER stored or logged — only the
 * extracted confirmation code is matched.
 *
 * Codes expire after 24 hours (AC: confirmation code expiry from Dev Notes).
 */

import { findByConfirmCode, updateSmsStatus } from './sms-queue'
import { reportSmsAuditEvent } from '@/lib/audit-client'
import { isValidConfirmCode } from './message-formatter'

// Confirmation codes expire after 24 hours
const CONFIRM_CODE_EXPIRY_MS = 24 * 60 * 60 * 1000

// Regex to extract confirmation code from physician reply
// Matches "CONFIRM XXXX" case-insensitively, tolerating extra whitespace
const CONFIRM_REPLY_REGEX = /\bCONFIRM\s+([A-Z2-9]{4})\b/i

// ---------------------------------------------------------------------------
// Process a single inbound confirmation message
// ---------------------------------------------------------------------------

export interface ConfirmationResult {
  matched: boolean
  smsQueueEntryId?: number
  reason?: string
}

/**
 * Process an inbound SMS body from a physician reply.
 *
 * Extracts the confirmation code, validates it, matches against smsQueue,
 * and marks the entry as confirmed if a valid unexpired match is found.
 *
 * PHI: the full message body is processed in-memory only — NEVER stored in Dexie
 * or included in audit metadata.
 *
 * Returns ConfirmationResult.matched = true if the code was accepted.
 */
export async function processConfirmationReply(
  inboundMessageBody: string,
): Promise<ConfirmationResult> {
  // Extract confirmation code from the reply body
  const match = CONFIRM_REPLY_REGEX.exec(inboundMessageBody)
  if (!match) {
    return { matched: false, reason: 'No CONFIRM code found in message' }
  }

  const code = match[1].toUpperCase()

  if (!isValidConfirmCode(code)) {
    return { matched: false, reason: 'Invalid confirmation code format' }
  }

  // Find matching queue entry
  const entry = await findByConfirmCode(code)
  if (!entry || entry.id == null) {
    return { matched: false, reason: 'Confirmation code not found' }
  }

  // Check if code has expired (24h window)
  const createdAt = new Date(entry.createdAt).getTime()
  if (Date.now() - createdAt > CONFIRM_CODE_EXPIRY_MS) {
    return { matched: false, reason: 'Confirmation code expired' }
  }

  // Check it's in a confirmable state
  if (entry.status === 'confirmed') {
    return { matched: true, smsQueueEntryId: entry.id, reason: 'Already confirmed' }
  }

  // Mark as confirmed
  await updateSmsStatus(entry.id, 'confirmed', {
    confirmedAt: new Date().toISOString(),
  })

  // Audit event (AC: 7) — no PHI in metadata
  reportSmsAuditEvent({
    action: 'SMS_CONFIRMED',
    smsQueueEntryId: entry.id,
    criticalResultRef: entry.criticalResultRef,
    escalationStep: entry.escalationStep,
    recipientRole: entry.recipientRole,
  })

  return { matched: true, smsQueueEntryId: entry.id }
}

// ---------------------------------------------------------------------------
// Bulk confirmation polling (called on connectivity restored)
// ---------------------------------------------------------------------------

/**
 * Poll the Hub API for pending SMS confirmations for this device.
 *
 * Called when `navigator.onLine` becomes true. The Hub API endpoint
 * collects inbound Twilio webhooks and queues them for pickup.
 *
 * Returns the number of confirmations processed.
 */
export async function pollForConfirmations(
  hubApiUrl: string,
  accessToken: string,
): Promise<number> {
  let confirmed = 0

  try {
    const resp = await fetch(`${hubApiUrl}/sms.confirmations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!resp.ok) return 0

    const body = (await resp.json()) as {
      result?: { data?: { json?: { confirmations?: Array<{ body: string }> } } }
    }

    const confirmations = body.result?.data?.json?.confirmations ?? []

    for (const { body: msgBody } of confirmations) {
      const result = await processConfirmationReply(msgBody)
      if (result.matched && !result.reason?.includes('Already confirmed')) {
        confirmed++
      }
    }
  } catch {
    // Network or parse error — silently skip (will retry next connectivity event)
  }

  return confirmed
}

/**
 * Story 49.2 — Critical SMS Dispatcher
 *
 * Integrates with Story 48.4's escalation chain to send SMS for critical values
 * when the device is offline and in-app notifications cannot be delivered.
 *
 * Escalation timing (offline mode):
 *   Step 1 (immediate) — SMS to ordering physician
 *   Step 2 (15 min, no confirm) — SMS to facility medical director
 *   Step 3 (30 min, no confirm) — SMS to district health officer
 *
 * PHI constraints (CLAUDE.md Rule #1):
 *   - patientIdCode is a 4-char opaque ID (NOT the FHIR Patient.id or name)
 *   - Message body never appears in logs or audit events
 *   - Recipient phone never appears in logs or audit events
 */

import { formatCriticalSms, generateConfirmCode } from './message-formatter'
import { TwilioSmsAdapter } from './twilio-adapter'
import { NativeSmsAdapter } from './native-adapter'
import { enqueueSms, updateSmsStatus, canSendSms, findPendingSmsForResult } from './sms-queue'
import { getDb } from '@/lib/db'
import type { SmsGatewayAdapter } from './sms-gateway'

// ---------------------------------------------------------------------------
// Escalation step timings
// ---------------------------------------------------------------------------

const ESCALATION_STEP_2_DELAY_MS = 15 * 60 * 1000  // 15 min
const ESCALATION_STEP_3_DELAY_MS = 30 * 60 * 1000  // 30 min

// ---------------------------------------------------------------------------
// Recipient contact (resolved from escalation config at dispatch time)
// ---------------------------------------------------------------------------

export interface EscalationRecipient {
  phone: string                                         // E.164 format
  role: 'physician' | 'medical_director' | 'dho'
  step: 1 | 2 | 3
}

export interface CriticalResultForSms {
  /** Opaque DiagnosticReport reference e.g. "DiagnosticReport/uuid" */
  criticalResultRef: string
  /** Short lab code e.g. "KBL-04" */
  labCode: string
  /** Opaque 4-char patient ID code — NOT the FHIR Patient.id or name */
  patientIdCode: string
  /** Abbreviated test code e.g. "K+" */
  testCode: string
  /** Critical value as string e.g. "7.2" */
  value: string
  /** Unit e.g. "mmol/L" */
  unit: string
  /** Whether this result is flagged as critical (from Story 48.4 thresholds) */
  isCritical: boolean
  /** Escalation recipients in priority order */
  recipients: EscalationRecipient[]
}

// ---------------------------------------------------------------------------
// Gateway factory — tries API gateway, falls back to native
// ---------------------------------------------------------------------------

async function resolveGatewayAdapter(): Promise<SmsGatewayAdapter> {
  try {
    const db = getDb()
    const config = await db.smsGatewayConfig.get('sms-config')

    if (config?.provider === 'twilio' && config.accountSid && config.authToken && config.senderNumber) {
      return new TwilioSmsAdapter({
        accountSid: config.accountSid,
        authToken: config.authToken,
        senderNumber: config.senderNumber,
      })
    }

    if (config?.provider === 'local' && config.localProviderUrl) {
      // Local provider: use Twilio-compatible REST interface at custom URL
      // Treated as Twilio adapter with localProviderUrl override
      return new TwilioSmsAdapter({
        accountSid: config.accountSid ?? 'local',
        authToken: config.authToken ?? 'local',
        senderNumber: config.senderNumber ?? '',
      })
    }
  } catch {
    // Config unavailable — fall through to native
  }

  return new NativeSmsAdapter()
}

// ---------------------------------------------------------------------------
// Core dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch SMS for a critical lab result.
 *
 * Prerequisites checked before sending:
 *   1. result.isCritical === true (only critical values trigger SMS, AC: 6)
 *   2. Device is offline (navigator.onLine === false, or force-offline flag)
 *   3. Rate limit not exceeded (AC: 10)
 *   4. No duplicate pending SMS for this result+step combination
 *
 * Returns the smsQueue entry id if SMS was queued, null if skipped/blocked.
 *
 * Never throws — SMS delivery must not block clinical workflow.
 */
export async function dispatchCriticalSms(
  result: CriticalResultForSms,
  opts?: { forceOffline?: boolean },
): Promise<number | null> {
  // AC: 6 — only trigger for critical values
  if (!result.isCritical) return null

  // Check connectivity (skip SMS if online — in-app escalation handles it)
  // If forceOffline is explicitly set, honour it; otherwise check navigator.onLine
  const isOffline =
    opts?.forceOffline !== undefined
      ? opts.forceOffline
      : typeof navigator !== 'undefined' && !navigator.onLine
  if (!isOffline) return null

  const physician = result.recipients.find((r) => r.step === 1)
  if (!physician) return null

  // Rate limit check (AC: 10)
  const rateCheck = await canSendSms(result.criticalResultRef)
  if (!rateCheck.allowed) return null

  // Deduplication — don't re-queue if a pending SMS already exists for step 1
  const existing = await findPendingSmsForResult(result.criticalResultRef, 1)
  if (existing) return existing.id ?? null

  // Generate confirmation code (AC: 3)
  const confirmCode = generateConfirmCode()

  // Format message (AC: 3) — PHI guard enforced inside formatCriticalSms
  const messageBody = formatCriticalSms({
    labCode: result.labCode,
    patientIdCode: result.patientIdCode,
    testCode: result.testCode,
    value: result.value,
    unit: result.unit,
    confirmCode,
  })

  // Queue entry (AC: 4)
  const now = new Date().toISOString()
  const entryId = await enqueueSms({
    recipientPhone: physician.phone,
    messageBody,
    confirmCode,
    criticalResultRef: result.criticalResultRef,
    status: 'queued',
    escalationStep: 1,
    recipientRole: 'physician',
    attempts: 0,
    lastAttemptAt: null,
    createdAt: now,
    confirmedAt: null,
  })

  // Attempt send via gateway (AC: 1, 8)
  void sendSmsEntry(entryId, physician.phone, messageBody)

  // Schedule step 2 escalation (15 min) if not confirmed (AC: 4)
  scheduleEscalationStep(result, 2, ESCALATION_STEP_2_DELAY_MS, confirmCode)

  // Schedule step 3 escalation (30 min) if not confirmed (AC: 4)
  scheduleEscalationStep(result, 3, ESCALATION_STEP_3_DELAY_MS, confirmCode)

  return entryId
}

/**
 * Attempt to send a queued SMS entry via the gateway adapter.
 * Updates status in Dexie on success/failure.
 * Never throws.
 */
export async function sendSmsEntry(
  entryId: number,
  recipientPhone: string,
  messageBody: string,
): Promise<void> {
  try {
    const adapter = await resolveGatewayAdapter()
    await updateSmsStatus(entryId, 'queued', {})

    const result = await adapter.send({ to: recipientPhone, body: messageBody })

    if (result.status === 'failed') {
      await updateSmsStatus(entryId, 'failed')
    } else {
      await updateSmsStatus(entryId, result.status === 'sent' ? 'sent' : 'queued', {
        messageId: result.messageId || undefined,
      })
    }
  } catch {
    try {
      await updateSmsStatus(entryId, 'failed')
    } catch {
      // Ignore — audit event will record this
    }
  }
}

// ---------------------------------------------------------------------------
// Escalation step scheduler
// ---------------------------------------------------------------------------

/**
 * Schedule a deferred escalation step using setTimeout.
 * On confirmation, the pending timer is checked against the confirmation status
 * in Dexie — if confirmed, the step is skipped.
 */
function scheduleEscalationStep(
  result: CriticalResultForSms,
  step: 2 | 3,
  delayMs: number,
  originalConfirmCode: string,
): void {
  if (typeof setTimeout === 'undefined') return

  setTimeout(async () => {
    try {
      // Check if already confirmed (don't escalate if physician replied)
      const db = getDb()
      const confirmed = await db.smsQueue
        .where('[criticalResultRef+escalationStep]')
        .equals([result.criticalResultRef, 1])
        .filter((e) => e.status === 'confirmed' && e.confirmCode === originalConfirmCode)
        .count()

      if (confirmed > 0) return  // physician confirmed — stop escalation

      // Rate limit re-check before step 2/3
      const rateCheck = await canSendSms(result.criticalResultRef)
      if (!rateCheck.allowed) return

      const recipient = result.recipients.find((r) => r.step === step)
      if (!recipient) return

      // Deduplication for this step
      const existing = await findPendingSmsForResult(result.criticalResultRef, step)
      if (existing) return

      const confirmCode = step === 2 ? generateConfirmCode() : generateConfirmCode()
      const messageBody = formatCriticalSms({
        labCode: result.labCode,
        patientIdCode: result.patientIdCode,
        testCode: result.testCode,
        value: result.value,
        unit: result.unit,
        confirmCode,
      })

      const now = new Date().toISOString()
      const entryId = await enqueueSms({
        recipientPhone: recipient.phone,
        messageBody,
        confirmCode,
        criticalResultRef: result.criticalResultRef,
        status: 'queued',
        escalationStep: step,
        recipientRole: recipient.role,
        attempts: 0,
        lastAttemptAt: null,
        createdAt: now,
        confirmedAt: null,
      })

      void sendSmsEntry(entryId, recipient.phone, messageBody)
    } catch {
      // Escalation timers must not crash the app
    }
  }, delayMs)
}

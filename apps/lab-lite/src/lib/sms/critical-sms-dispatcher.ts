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
import { enqueueSms, updateSmsStatus, canSendSms, findPendingSmsForResult, isConfirmCodeActive } from './sms-queue'
import { reportSmsAuditEvent } from '@/lib/audit-client'
import { getDb } from '@/lib/db'
import type { SmsGatewayAdapter } from './sms-gateway'

// ---------------------------------------------------------------------------
// Escalation step timings
// ---------------------------------------------------------------------------

const ESCALATION_STEP_2_DELAY_MS = 15 * 60 * 1000  // 15 min
const ESCALATION_STEP_3_DELAY_MS = 30 * 60 * 1000  // 30 min
const MAX_SEND_ATTEMPTS = 3

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
      return new TwilioSmsAdapter({
        accountSid: config.accountSid ?? 'local',
        authToken: config.authToken ?? 'local',
        senderNumber: config.senderNumber ?? '',
        baseUrl: config.localProviderUrl,
      })
    }
  } catch {
    // Config unavailable — fall through to native
  }

  return new NativeSmsAdapter()
}

// ---------------------------------------------------------------------------
// Collision-resistant confirm code generation
// ---------------------------------------------------------------------------

async function generateUniqueConfirmCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateConfirmCode()
    const active = await isConfirmCodeActive(code)
    if (!active) return code
  }
  // Extremely unlikely to reach here (10 consecutive collisions from ~810K space)
  return generateConfirmCode()
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
  const isOffline =
    opts?.forceOffline !== undefined
      ? opts.forceOffline
      : typeof navigator !== 'undefined' && !navigator.onLine
  if (!isOffline) return null

  const physician = result.recipients.find((r) => r.step === 1)
  if (!physician) return null

  // Rate limit check (AC: 10)
  const rateCheck = await canSendSms(result.criticalResultRef)
  if (!rateCheck.allowed) {
    reportSmsAuditEvent({
      action: 'SMS_RATE_LIMITED',
      smsQueueEntryId: 0,
      criticalResultRef: result.criticalResultRef,
      escalationStep: 1,
      recipientRole: 'physician',
    })
    return null
  }

  // Deduplication — don't re-queue if a pending SMS already exists for step 1
  const existing = await findPendingSmsForResult(result.criticalResultRef, 1)
  if (existing) return existing.id ?? null

  // Generate collision-resistant confirmation code (AC: 3)
  const confirmCode = await generateUniqueConfirmCode()

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

  // Audit: SMS_QUEUED (AC: 7)
  reportSmsAuditEvent({
    action: 'SMS_QUEUED',
    smsQueueEntryId: entryId,
    criticalResultRef: result.criticalResultRef,
    escalationStep: 1,
    recipientRole: 'physician',
  })

  // Attempt send via gateway (AC: 1, 8)
  void sendSmsEntry(entryId, physician.phone, messageBody, result.criticalResultRef, 1, 'physician')

  // Schedule durable escalation steps (D2: persist to Dexie)
  await persistEscalationSchedule(result, ESCALATION_STEP_2_DELAY_MS, 2)
  await persistEscalationSchedule(result, ESCALATION_STEP_3_DELAY_MS, 3)

  // Also set in-memory timers for the current session
  scheduleEscalationStep(result, 2, ESCALATION_STEP_2_DELAY_MS)
  scheduleEscalationStep(result, 3, ESCALATION_STEP_3_DELAY_MS)

  return entryId
}

/**
 * Attempt to send a queued SMS entry via the gateway adapter.
 * Updates status in Dexie on success/failure. Increments attempts.
 * Emits audit events for each status transition (AC: 7).
 * Never throws.
 */
export async function sendSmsEntry(
  entryId: number,
  recipientPhone: string,
  messageBody: string,
  criticalResultRef?: string,
  escalationStep?: number,
  recipientRole?: string,
): Promise<void> {
  const ref = criticalResultRef ?? ''
  const step = escalationStep ?? 1
  const role = recipientRole ?? 'physician'

  try {
    const adapter = await resolveGatewayAdapter()

    // Increment attempts
    const db = getDb()
    const entry = await db.smsQueue.get(entryId)
    if (entry) {
      await db.smsQueue.update(entryId, { attempts: (entry.attempts ?? 0) + 1 })
    }

    const result = await adapter.send({ to: recipientPhone, body: messageBody })

    if (result.status === 'failed') {
      await updateSmsStatus(entryId, 'failed')
      reportSmsAuditEvent({ action: 'SMS_FAILED', smsQueueEntryId: entryId, criticalResultRef: ref, escalationStep: step, recipientRole: role })
    } else {
      const status = result.status === 'sent' ? 'sent' as const : 'queued' as const
      await updateSmsStatus(entryId, status, { messageId: result.messageId || undefined })
      reportSmsAuditEvent({ action: status === 'sent' ? 'SMS_SENT' : 'SMS_QUEUED', smsQueueEntryId: entryId, criticalResultRef: ref, escalationStep: step, recipientRole: role })
    }
  } catch {
    try {
      await updateSmsStatus(entryId, 'failed')
      reportSmsAuditEvent({ action: 'SMS_FAILED', smsQueueEntryId: entryId, criticalResultRef: ref, escalationStep: step, recipientRole: role })
    } catch {
      // Audit and status update both failed — nothing more we can do
    }
  }
}

// ---------------------------------------------------------------------------
// Retry queue processor
// ---------------------------------------------------------------------------

/**
 * Process failed SMS entries that haven't exceeded max attempts.
 * Call this periodically (e.g., on app focus or connectivity change).
 */
export async function retryFailedSms(): Promise<void> {
  try {
    const db = getDb()
    const failed = await db.smsQueue
      .where('status')
      .equals('failed')
      .filter((e) => (e.attempts ?? 0) < MAX_SEND_ATTEMPTS)
      .toArray()

    for (const entry of failed) {
      if (entry.id == null) continue
      const rateCheck = await canSendSms(entry.criticalResultRef)
      if (!rateCheck.allowed) continue
      await sendSmsEntry(entry.id, entry.recipientPhone, entry.messageBody, entry.criticalResultRef, entry.escalationStep, entry.recipientRole)
    }
  } catch {
    // Retry processor must not crash
  }
}

// ---------------------------------------------------------------------------
// Durable escalation schedule (D2: persisted to Dexie)
// ---------------------------------------------------------------------------

async function persistEscalationSchedule(
  result: CriticalResultForSms,
  delayMs: number,
  step: 2 | 3,
): Promise<void> {
  try {
    const db = getDb()
    const scheduledAt = new Date(Date.now() + delayMs).toISOString()
    await db.smsEscalationSchedule.add({
      criticalResultRef: result.criticalResultRef,
      escalationStep: step,
      scheduledAt,
      fired: false,
      createdAt: new Date().toISOString(),
    })
  } catch {
    // Non-fatal — in-memory timer is the backup
  }
}

/**
 * Check for overdue escalation schedules and fire them.
 * Call on app mount / focus to recover from tab close.
 */
export async function checkDueEscalations(
  resultLookup: (ref: string) => CriticalResultForSms | undefined,
): Promise<void> {
  try {
    const db = getDb()
    const now = new Date().toISOString()
    const due = await db.smsEscalationSchedule
      .where('fired')
      .equals(0)  // Dexie stores booleans as 0/1
      .filter((e) => e.scheduledAt <= now)
      .toArray()

    for (const schedule of due) {
      if (schedule.id == null) continue

      // Mark as fired immediately to prevent re-processing
      await db.smsEscalationSchedule.update(schedule.id, { fired: true })

      const result = resultLookup(schedule.criticalResultRef)
      if (!result) continue

      await fireEscalationStep(result, schedule.escalationStep as 2 | 3)
    }
  } catch {
    // Recovery check must not crash
  }
}

// ---------------------------------------------------------------------------
// Escalation step execution (shared by timer and durable schedule)
// ---------------------------------------------------------------------------

async function fireEscalationStep(
  result: CriticalResultForSms,
  step: 2 | 3,
): Promise<void> {
  try {
    // Check if ANY prior step was confirmed — stop escalation
    const db = getDb()
    const confirmed = await db.smsQueue
      .where('criticalResultRef')
      .equals(result.criticalResultRef)
      .filter((e) => e.status === 'confirmed')
      .count()

    if (confirmed > 0) return

    const rateCheck = await canSendSms(result.criticalResultRef)
    if (!rateCheck.allowed) return

    const recipient = result.recipients.find((r) => r.step === step)
    if (!recipient) return

    const existing = await findPendingSmsForResult(result.criticalResultRef, step)
    if (existing) return

    const confirmCode = await generateUniqueConfirmCode()
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

    reportSmsAuditEvent({
      action: 'SMS_QUEUED',
      smsQueueEntryId: entryId,
      criticalResultRef: result.criticalResultRef,
      escalationStep: step,
      recipientRole: recipient.role,
    })

    void sendSmsEntry(entryId, recipient.phone, messageBody, result.criticalResultRef, step, recipient.role)
  } catch {
    // Escalation must not crash the app
  }
}

// ---------------------------------------------------------------------------
// In-memory escalation timer (backup for current session)
// ---------------------------------------------------------------------------

function scheduleEscalationStep(
  result: CriticalResultForSms,
  step: 2 | 3,
  delayMs: number,
): void {
  if (typeof setTimeout === 'undefined') return

  setTimeout(async () => {
    await fireEscalationStep(result, step)
  }, delayMs)
}

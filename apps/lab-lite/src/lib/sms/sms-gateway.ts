/**
 * Story 49.2 — SMS Fallback for Critical Results
 * Core SMS gateway types, adapter interface, and delivery status definitions.
 *
 * PHI rule (CLAUDE.md Rule #1): Message body and recipient phone are NEVER
 * included in audit metadata. The adapter interface accepts them only for
 * actual message delivery, not for logging.
 */

// ---------------------------------------------------------------------------
// Delivery Status
// ---------------------------------------------------------------------------

export type SmsDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'confirmed'

// ---------------------------------------------------------------------------
// Adapter result types
// ---------------------------------------------------------------------------

export interface SmsDeliveryResult {
  messageId: string
  status: 'queued' | 'sent' | 'failed'
  errorCode?: string
}

// ---------------------------------------------------------------------------
// Gateway adapter interface — strategy pattern for multiple providers
// ---------------------------------------------------------------------------

export interface SmsGatewayAdapter {
  /**
   * Send a single SMS message.
   * `from` is optional — some adapters derive it from config.
   */
  send(params: { to: string; body: string; from?: string }): Promise<SmsDeliveryResult>

  /**
   * Check delivery status of a previously sent message.
   * Optional — NativeAdapter cannot check status programmatically.
   */
  checkStatus?(messageId: string): Promise<SmsDeliveryStatus>
}

// ---------------------------------------------------------------------------
// SMS gateway configuration (stored encrypted in Dexie)
// ---------------------------------------------------------------------------

export type SmsProvider = 'twilio' | 'local' | 'native'

export interface SmsGatewayConfig {
  id: 'sms-config'          // singleton row
  provider: SmsProvider
  accountSid?: string        // Twilio Account SID (encrypted at rest)
  authToken?: string         // Twilio Auth Token (encrypted at rest)
  senderNumber?: string      // E.164 format e.g. "+93701234567"
  localProviderUrl?: string  // endpoint for regional providers
  updatedBy: string          // practitioner ID of lab manager who saved
  updatedAt: string          // ISO 8601
}

// ---------------------------------------------------------------------------
// SMS Queue entry (stored in Dexie `smsQueue` table)
// ---------------------------------------------------------------------------

export interface SmsQueueEntry {
  id?: number
  messageId?: string             // from gateway response, null until sent
  recipientPhone: string         // E.164 format — NOT logged in audit
  messageBody: string            // formatted message — NOT logged in audit
  confirmCode: string            // 4-char alphanumeric code
  criticalResultRef: string      // opaque DiagnosticReport reference
  status: SmsDeliveryStatus
  escalationStep: number         // 1 = physician, 2 = director, 3 = DHO
  recipientRole: 'physician' | 'medical_director' | 'dho'
  attempts: number
  lastAttemptAt: string | null
  createdAt: string
  confirmedAt: string | null
}

// ---------------------------------------------------------------------------
// Rate limit check result
// ---------------------------------------------------------------------------

export interface RateLimitCheckResult {
  allowed: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Durable escalation schedule entry (stored in Dexie for timer persistence)
// ---------------------------------------------------------------------------

export interface SmsEscalationScheduleEntry {
  id?: number
  criticalResultRef: string
  escalationStep: 2 | 3
  scheduledAt: string           // ISO 8601 — when the escalation should fire
  fired: boolean                // true once the escalation has been processed
  createdAt: string
}

/**
 * Story 49.2 — SMS Delivery Queue Helpers & Rate Limiter
 *
 * All queue operations go through Dexie for offline resilience.
 * Rate limits (AC: 10):
 *   - Max 5 SMS per critical result (across all escalation steps)
 *   - Max 20 SMS per hour from this device
 *
 * PHI note: smsQueue entries contain recipientPhone and messageBody.
 * These are ONLY used for delivery — NEVER passed to audit functions.
 */

import { getDb } from '@/lib/db'
import type { SmsQueueEntry, SmsDeliveryStatus, RateLimitCheckResult } from './sms-gateway'

const MAX_SMS_PER_RESULT = 5
const MAX_SMS_PER_HOUR = 20

// ---------------------------------------------------------------------------
// Queue CRUD helpers
// ---------------------------------------------------------------------------

export async function enqueueSms(
  entry: Omit<SmsQueueEntry, 'id'>,
): Promise<number> {
  const db = getDb()
  return db.smsQueue.add(entry as SmsQueueEntry)
}

export async function updateSmsStatus(
  id: number,
  status: SmsDeliveryStatus,
  opts?: { messageId?: string; confirmedAt?: string },
): Promise<void> {
  const db = getDb()
  const patch: Partial<SmsQueueEntry> = {
    status,
    lastAttemptAt: new Date().toISOString(),
    ...opts,
  }
  await db.smsQueue.update(id, patch)
}

export async function getSmsQueueEntry(id: number): Promise<SmsQueueEntry | undefined> {
  const db = getDb()
  return db.smsQueue.get(id)
}

export async function findPendingSmsForResult(
  criticalResultRef: string,
  escalationStep: number,
): Promise<SmsQueueEntry | undefined> {
  const db = getDb()
  return db.smsQueue
    .where('[criticalResultRef+escalationStep]')
    .equals([criticalResultRef, escalationStep])
    .filter((e) => e.status === 'queued' || e.status === 'sent')
    .first()
}

export async function findByConfirmCode(confirmCode: string): Promise<SmsQueueEntry | undefined> {
  const db = getDb()
  return db.smsQueue.where('confirmCode').equals(confirmCode).first()
}

export async function getPendingQueue(): Promise<SmsQueueEntry[]> {
  const db = getDb()
  return db.smsQueue
    .where('status')
    .equals('queued')
    .sortBy('createdAt')
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

/**
 * Check whether an SMS can be sent for a given critical result.
 *
 * Rules (AC: 10):
 *   1. No more than 5 SMS per critical result (all escalation steps combined).
 *   2. No more than 20 SMS per hour from this device (since Dexie is per-device,
 *      we count all entries created within the last 60 minutes).
 *
 * Returns `{ allowed: true }` if both limits pass,
 * or `{ allowed: false, reason: '...' }` if either limit is exceeded.
 */
export async function canSendSms(criticalResultRef: string): Promise<RateLimitCheckResult> {
  const db = getDb()

  // Check 1: per-result limit
  const resultCount = await db.smsQueue
    .where('criticalResultRef')
    .equals(criticalResultRef)
    .count()

  if (resultCount >= MAX_SMS_PER_RESULT) {
    return {
      allowed: false,
      reason: `Rate limit: ${MAX_SMS_PER_RESULT} SMS already sent for this critical result`,
    }
  }

  // Check 2: per-device hourly limit
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const hourlyCount = await db.smsQueue
    .where('createdAt')
    .above(oneHourAgo)
    .count()

  if (hourlyCount >= MAX_SMS_PER_HOUR) {
    return {
      allowed: false,
      reason: `Rate limit: ${MAX_SMS_PER_HOUR} SMS per hour limit reached for this device`,
    }
  }

  return { allowed: true }
}

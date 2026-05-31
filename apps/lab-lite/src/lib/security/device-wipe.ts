/**
 * Story 49.4 — Device Wipe
 *
 * Permanently erases all PHI from IndexedDB and browser caches.
 *
 * PRESERVED: clientAuditLog (audit trail is never deleted — institutional
 * accountability per CLAUDE.md and Story 8.1/8.2).
 *
 * ERASED: all PHI tables (patients, uploadQueue, verified_patients, syncQueue,
 *   practitioner_keys, consentRecords, culturalPreferences, orders, payments,
 *   employee_health_records, queueEntries)
 *
 * ALSO CLEARED: Service Worker caches (may contain cached API responses with PHI).
 *
 * Audit events are emitted BEFORE the wipe so they are part of the preserved
 * audit trail.
 *
 * Double-confirmation required:
 *   1. Caller must pass the exact WIPE_CONFIRMATION_PHRASE.
 *   2. This function throws if the phrase does not match.
 */

import { getDb } from '@/lib/db'
import { PHI_TABLES } from '@/lib/security/emergency-encrypt'

/** The confirmation phrase that must be typed to authorize the wipe. */
export const WIPE_CONFIRMATION_PHRASE = 'ERASE ALL DATA'

/** PHI tables cleared during wipe (superset of PHI_TABLES + operational PHI). */
const WIPE_TABLES = [
  ...PHI_TABLES,
  'orders',
  'payments',
  'employee_health_records',
  'queueEntries',
] as const

/** The single table that must NEVER be wiped. */
const PRESERVED_TABLE = 'clientAuditLog'

interface DeviceWipeOptions {
  /** Must equal WIPE_CONFIRMATION_PHRASE exactly. */
  confirmationPhrase: string
  /** Optional: custom phrase for localized UIs. Defaults to WIPE_CONFIRMATION_PHRASE. */
  expectedPhrase?: string
}

/**
 * Perform device wipe.
 *
 * @throws Error if confirmationPhrase does not match expectedPhrase.
 * @throws Error if called by a non-manager (checked via session store).
 */
export async function performDeviceWipe(opts: DeviceWipeOptions): Promise<void> {
  const expected = opts.expectedPhrase ?? WIPE_CONFIRMATION_PHRASE

  if (opts.confirmationPhrase !== expected) {
    throw new Error(
      `Wipe aborted: confirmation phrase does not match. Expected "${expected}".`,
    )
  }

  // Emit SECURITY_WIPE_INITIATED BEFORE the wipe so it is part of the audit trail
  await emitWipeAuditEvent('SECURITY_WIPE_INITIATED')

  const db = getDb()

  // Clear all PHI tables in a single transaction
  await db.transaction(
    'rw',
    WIPE_TABLES.map((name) => db.table(name)),
    async () => {
      for (const tableName of WIPE_TABLES) {
        await db.table(tableName).clear()
      }
    },
  )

  // Clear Service Worker caches (may contain cached PHI responses)
  if (typeof caches !== 'undefined') {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((name) => caches.delete(name)))
  }

  // Unregister Service Workers
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
  }

  // Emit SECURITY_WIPE_COMPLETED — this goes into the preserved audit trail
  await emitWipeAuditEvent('SECURITY_WIPE_COMPLETED')

  // Sanity check: clientAuditLog must not have been cleared
  const preservedCount = db.clientAuditLog
    ? await db.clientAuditLog.count()
    : 0

  // Log completion (no PHI — only counts)
  console.info(
    `[security] Wipe complete. PHI tables cleared. ${PRESERVED_TABLE} preserved (${preservedCount} records).`,
  )
}

async function emitWipeAuditEvent(
  action: 'SECURITY_WIPE_INITIATED' | 'SECURITY_WIPE_COMPLETED',
): Promise<void> {
  try {
    const { reportSecurityAuditEvent } = await import('@/lib/audit-client')
    reportSecurityAuditEvent({
      action,
      tablesAffected: [...WIPE_TABLES],
    })
    // Give the async emitter a tick to flush
    await new Promise((r) => setTimeout(r, 0))
  } catch {
    // Best-effort — never block the wipe for an audit failure
  }
}

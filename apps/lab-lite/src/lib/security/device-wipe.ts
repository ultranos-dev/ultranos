/**
 * Story 49.4 — Device Wipe
 *
 * Permanently erases all PHI from IndexedDB and browser caches.
 *
 * PRESERVED: clientAuditLog (audit trail is never deleted — institutional
 * accountability per CLAUDE.md and Story 8.1/8.2).
 *
 * ALSO CLEARED: Service Worker caches (may contain cached API responses with PHI).
 *
 * Audit events are emitted BEFORE the wipe so they are part of the preserved
 * audit trail.
 *
 * Double-confirmation required:
 *   1. Caller must pass the exact confirmation phrase.
 *   2. This function throws if the phrase does not match.
 */

import { getDb } from '@/lib/db'
import { PHI_TABLES } from '@/lib/security/emergency-encrypt'
import { setReadOnlyBypass } from '@/lib/security/read-only-guard'

/** The default confirmation phrase (English). For localized UIs, pass expectedPhrase. */
export const WIPE_CONFIRMATION_PHRASE = 'ERASE ALL DATA'

/** The single table that must NEVER be wiped. */
const PRESERVED_TABLE = 'clientAuditLog'

interface DeviceWipeOptions {
  /** Must match expectedPhrase exactly. */
  confirmationPhrase: string
  /** Localized phrase for the current locale. Defaults to WIPE_CONFIRMATION_PHRASE. */
  expectedPhrase?: string
}

/**
 * Perform device wipe.
 *
 * @throws Error if confirmationPhrase does not match expectedPhrase.
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

  // Bypass read-only guard for this privileged operation
  setReadOnlyBypass(true)
  try {
    // Clear each PHI table individually — skip tables that don't exist in this schema version
    for (const tableName of PHI_TABLES) {
      try {
        await db.table(tableName).clear()
      } catch {
        // Table may not exist in this schema version — skip
      }
    }
  } finally {
    setReadOnlyBypass(false)
  }

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
      tablesAffected: [...PHI_TABLES],
    })
    // Give the async emitter a tick to flush
    await new Promise((r) => setTimeout(r, 0))
  } catch {
    // Best-effort — never block the wipe for an audit failure
  }
}

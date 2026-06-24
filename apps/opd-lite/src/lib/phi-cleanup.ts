import { db } from './db'

/**
 * Tables containing PHI that must be cleared on session end.
 * Clearing these tables deletes encrypted PHI blobs from IndexedDB,
 * providing defense-in-depth beyond key-wipe alone.
 */
export const PHI_TABLES = [
  'patients',
  'encounters',
  'soapLedger',
  'observations',
  'conditions',
  'medications',
  'allergyIntolerances',
  'medicationStatements',
  'interactionAuditLog',
  'practitionerKeys',
  'diagnosticReports',
  'appointments', // Stores patient-linked appointment PHI (datetime, practitioner ref, reason)
  'syncMeta',      // Stores last-pulled-at timestamps per patient — contains patient IDs as FK
] as const

/**
 * Tables that must NEVER be cleared on session end:
 * - syncQueue: queued items must survive for drain on next session
 * - clientAuditLog: append-only audit trail (opaque IDs, no PHI)
 * - vocabulary*: non-PHI reference data
 */
export const PRESERVE_TABLES = [
  'syncQueue',
  'clientAuditLog',
  'vocabularyMedications',
  'vocabularyIcd10',
  'vocabularyInteractions',
  // AI model metadata (non-PHI reference data — model IDs, versions, checksums)
  'aiModels',
  'modelDownloadProgress',
  // Appointment slots — provider availability windows (schedule.reference points to
  // a practitioner Schedule, NOT a patient). Consistent with the encryption config,
  // which already treats `slots` as non-encrypted (unlike `appointments`).
  // IMPORTANT: if a patient reference is ever added to FhirSlot, move this to PHI_TABLES.
  'slots',
  // Data budget tracking (non-PHI — byte counts and category labels only)
  'dataBudgetConfig',
  'dataUsage',
  // Encryption migration status (non-PHI — table names and status only)
  'encryptionMigrations',
  // Phase 1: enriched drug-catalog mirror + brands (non-PHI reference data)
  'drugCatalogMirror',
  'drugBrandsMirror',
  'drugBrandPresentationsMirror',
  'drugCatalogSyncMeta',
] as const

// Compile-time safety: ensure syncQueue is never in the PHI list
type AssertNotInPhi<T extends string> = T extends (typeof PHI_TABLES)[number] ? never : T
type _SyncQueueSafe = AssertNotInPhi<'syncQueue'>

/**
 * Clear all PHI tables from IndexedDB.
 * Fires all clears in parallel for speed (important for beforeunload).
 * Never throws � swallows errors to avoid blocking logout/tab-close.
 */
export async function clearPhiTables(): Promise<void> {
  await Promise.allSettled(
    PHI_TABLES.map((tableName) => {
      try {
        const table = db.table(tableName)
        return table.clear()
      } catch {
        // Table may not exist in this schema version � skip gracefully.
        return Promise.resolve()
      }
    }),
  )
}

/**
 * Delete 'synced' entries from the sync queue on session end.
 *
 * AC 28.3-4: entries with status 'pending', 'failed', or 'awaiting-key' are
 * RETAINED — they are encrypted and unreadable without the session key.
 * This provides defense-in-depth: even if someone accesses IndexedDB directly,
 * the payloads are opaque ciphertext.
 *
 * 'synced' entries have already been delivered to the Hub and have no
 * operational value — deleting them reduces PHI surface area.
 *
 * Never throws.
 */
export async function clearSyncedQueueEntries(): Promise<void> {
  try {
    const synced = await db.syncQueue.where('status').equals('synced').toArray()
    await Promise.allSettled(synced.map((e) => db.syncQueue.delete(e.id)))
  } catch {
    // Swallow — must not block logout
  }
}

/**
 * Verify that all PHI tables are empty.
 * Used on session start to detect incomplete cleanup from a previous session.
 * Returns true if all PHI tables are empty, false if stale data exists.
 */
export async function verifyPhiCleanup(): Promise<boolean> {
  try {
    const counts = await Promise.all(
      PHI_TABLES.map((tableName) => db.table(tableName).count()),
    )
    return counts.every((c) => c === 0)
  } catch {
    // If we cannot verify, assume dirty � caller should force-clear
    return false
  }
}

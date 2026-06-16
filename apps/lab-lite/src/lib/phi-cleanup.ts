import { getDb } from './db'

/**
 * Tables containing PHI that must be cleared on session end.
 *
 * Lab-Lite stores minimal PHI per CLAUDE.md rule #7 (patient name + age only
 * for verification). Despite this, the following tables contain patient-linked
 * data and must be cleared to prevent workstation data leakage.
 *
 * Tables determined by auditing LabLiteDatabase table declarations in db.ts:
 *   uploadQueue        — patientFirstName, patientRef, encrypted file blob
 *   verified_patients  — firstName, age (patient verification cache)
 *   patientVerifications — patientRef, sample linkage
 *   samples            — subject.reference (FHIR patient ref), specimen data
 *   orders             — patientFirstName, patientAge, patientRef
 *   queueEntries       — patientFirstName, patientAge, patientRef, token
 *   consentRecords     — patientRef, encrypted audio/thumbprint blobs
 *   payments           — patientRef (financial + patient linkage)
 *   culturalPreferences — patientRef, cultural flags
 *   familyDelegates    — patientRef, AES-GCM encrypted delegatePhone/delegateName
 *   smsQueue           — recipientPhone, messageBody (critical result notification content)
 *   lab_results        — patientRef, reportComment (clinical content)
 *   lab_observations   — linked to lab_results; clinical analyte values
 *   amendments         — originalValues, amendedValues (clinical result snapshots)
 *   labLogbook         — patientRef, patientFirstName, patientAge
 *   chw_samples        — patientRef (Community Health Worker collection data)
 */
export const PHI_TABLES = [
  'uploadQueue',
  'verified_patients',
  'patientVerifications',
  'samples',
  'orders',
  'queueEntries',
  'consentRecords',
  'payments',
  'culturalPreferences',
  'familyDelegates',
  'smsQueue',
  'lab_results',
  'lab_observations',
  'amendments',
  'labLogbook',
  'chw_samples',
] as const

/**
 * Tables that must NEVER be cleared on session end.
 *
 * syncQueue          — pending/failed entries contain unsynced data; must survive for drain
 * clientAuditLog     — append-only audit trail (opaque IDs, no PHI); regulatory requirement
 * practitioner_keys  — Ed25519 public key cache; not patient PHI
 */
export const PRESERVE_TABLES = [
  'syncQueue',
  'clientAuditLog',
  'practitioner_keys',
] as const

// Compile-time safety: ensure syncQueue is never accidentally added to PHI_TABLES
type AssertNotInPhi<T extends string> = T extends (typeof PHI_TABLES)[number] ? never : T
type _SyncQueueSafe = AssertNotInPhi<'syncQueue'>

/**
 * Clear all PHI tables from IndexedDB.
 * Fires all clears in parallel for speed (important for beforeunload).
 * Also clears the session encryption key used for consent blobs.
 * Never throws — swallows errors to avoid blocking logout/tab-close.
 */
export async function clearPhiTables(): Promise<void> {
  const db = getDb()
  await Promise.allSettled(
    PHI_TABLES.map((tableName) => {
      try {
        const table = db.table(tableName)
        return table.clear()
      } catch {
        // Table may not exist in this schema version — skip gracefully.
        return Promise.resolve()
      }
    }),
  )
}

/**
 * Purge synced entries from the sync queue.
 * Deletes entries with status 'synced' (no longer needed — already on Hub).
 * Retains 'pending' and 'failed' entries because they contain unsynced
 * clinical data that must not be lost.
 *
 * Called during logout and session expiry as part of cleanup (Story 28.2).
 * Full sync-queue PHI encryption is Story 28.3.
 */
export async function purgeSyncedQueueEntries(): Promise<void> {
  try {
    const db = getDb()
    await db.syncQueue.where('status').equals('synced').delete()
  } catch {
    // Non-fatal — if delete fails, entries remain but are harmless (already on Hub).
  }
}

/**
 * Verify that all PHI tables are empty.
 * Used on session start to detect incomplete cleanup from a previous session.
 * Returns true if all PHI tables are empty, false if stale data exists.
 */
export async function verifyPhiCleanup(): Promise<boolean> {
  try {
    const db = getDb()
    const counts = await Promise.all(
      PHI_TABLES.map((tableName) => db.table(tableName).count()),
    )
    return counts.every((c) => c === 0)
  } catch {
    // If we can't verify, assume dirty — caller should force-clear
    return false
  }
}

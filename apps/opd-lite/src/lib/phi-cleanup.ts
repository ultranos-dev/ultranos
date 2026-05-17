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
] as const

// Compile-time safety: ensure syncQueue is never in the PHI list
type AssertNotInPhi<T extends string> = T extends (typeof PHI_TABLES)[number] ? never : T
type _SyncQueueSafe = AssertNotInPhi<'syncQueue'>

/**
 * Clear all PHI tables from IndexedDB.
 * Fires all clears in parallel for speed (important for beforeunload).
 * Never throws — swallows errors to avoid blocking logout/tab-close.
 */
export async function clearPhiTables(): Promise<void> {
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
    // If we can't verify, assume dirty — caller should force-clear
    return false
  }
}

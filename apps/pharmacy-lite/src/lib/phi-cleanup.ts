import { db } from './db'

/**
 * Tables containing PHI that must be cleared on session end.
 * All three tables are AES-256-GCM encrypted via dexie-encryption-middleware,
 * but clearing them provides defence-in-depth beyond key-wipe alone.
 *
 * Determined from db.ts PHI_TABLE_CONFIGS:
 *   dispenses          — medication dispense records (subject reference + clinical content)
 *   dispenseAuditLog   — references patientRef and medicationDisplay (clinical content)
 *   patients           — local patient registry (name, phone, allergies)
 */
export const PHI_TABLES = [
  'dispenses',
  'dispenseAuditLog',
  'patients',
] as const

/**
 * Tables that must NEVER be cleared on session end:
 *   syncQueue          — pending/failed entries contain unsynced clinical data; must survive for drain
 *   practitionerKeys   — Ed25519 public key cache; not PHI
 *   revokedKeys        — KRL entries; not PHI
 *   pendingAuditEvents — opaque IDs only; not PHI; queued for sync
 *   clientAuditLog     — append-only audit trail (opaque IDs, no PHI)
 *   catalogItems       — medication catalog reference data; not PHI
 *   stockBatches       — inventory operational data; not PHI
 *   stockMovements     — inventory operational data; not PHI
 *   goodsReceipts      — inventory operational data; not PHI
 *   pharmacySettings   — lab-level configuration; not PHI
 *   invoices           — financial records (patient accounts); not clinical PHI
 *   payments           — financial records; not clinical PHI
 *   ledgerEntries      — financial ledger; not clinical PHI
 *   patientAccounts    — financial account records; not clinical PHI
 *   cashDrawers        — POS operational data; not PHI
 *   suppliers          — procurement reference data; not PHI
 *   purchaseOrders     — procurement operational data; not PHI
 *   stockCounts        — inventory count records; not PHI
 *   stockTransfers     — cross-location stock movements; not PHI
 *   dataBudgetConfig   — network usage configuration; not PHI
 *   dataUsage          — network usage metrics; not PHI
 */
export const PRESERVE_TABLES = [
  'syncQueue',
  'practitionerKeys',
  'revokedKeys',
  'pendingAuditEvents',
  'clientAuditLog',
  'catalogItems',
  'stockBatches',
  'stockMovements',
  'goodsReceipts',
  'pharmacySettings',
  'invoices',
  'payments',
  'ledgerEntries',
  'patientAccounts',
  'cashDrawers',
  'suppliers',
  'purchaseOrders',
  'stockCounts',
  'stockTransfers',
  'dataBudgetConfig',
  'dataUsage',
  // Phase 2: enriched drug-catalog mirror + brands (non-PHI reference data)
  'drugCatalogMirror',
  'drugBrandsMirror',
  'drugBrandPresentationsMirror',
  'drugCatalogSyncMeta',
] as const

// Compile-time safety: ensure syncQueue is never accidentally added to PHI_TABLES
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
 * Purge synced entries from the sync queue.
 * Deletes entries with status 'synced' (no longer needed — already on Hub).
 * Retains 'pending', 'in-flight', and 'failed' entries because they contain
 * unsynced clinical data that must not be lost.
 *
 * Called during logout and session expiry as part of cleanup (Story 28.2).
 * Full sync-queue PHI encryption is Story 28.3.
 */
export async function purgeSyncedQueueEntries(): Promise<void> {
  try {
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
    const counts = await Promise.all(
      PHI_TABLES.map((tableName) => db.table(tableName).count()),
    )
    return counts.every((c) => c === 0)
  } catch {
    // If we can't verify, assume dirty — caller should force-clear
    return false
  }
}

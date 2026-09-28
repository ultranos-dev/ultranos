import { db } from './db'

/**
 * Tables containing PHI that must be cleared on session end.
 * All three tables are AES-256-GCM encrypted via dexie-encryption-middleware,
 * but clearing them provides defence-in-depth beyond key-wipe alone.
 *
 * Determined from db.ts PHI_TABLE_CONFIGS:
 *   dispenses           — medication dispense records (subject reference + clinical content)
 *   dispenseAuditLog    — references patientRef and medicationDisplay (clinical content)
 *   patients            — local patient registry (name, phone, allergies)
 *   patientAllergyCache — cached hub allergy fetch (allergy substances — Story 57.1)
 */
export const PHI_TABLES = [
  'dispenses',
  'dispenseAuditLog',
  'patients',
  'patientAllergyCache',
  // Patient clinical records captured by the shared registration/edit form (v25).
  // Encrypted PHI cache cleared on logout — the unsynced writes survive separately
  // in syncQueue (PRESERVE), so clearing these loses no pending Hub data.
  'allergyIntolerances',
  'observations',
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
 *   invoices           — financial records (patient accounts); not clinical PHI.
 *                        Story 58.3 (M-PHARM-3): invoice line `description` no
 *                        longer carries the medication free-text name — it is a
 *                        de-identified generic label (dosage form + strength);
 *                        the exact drug is referenced only by the opaque
 *                        `catalogItemId`. With the medication name stripped at the
 *                        write site (fulfillment-store.createInvoiceAfterDispense),
 *                        invoices no longer hold patient-linked clinical free-text,
 *                        so they remain PRESERVED (financial durability) rather than
 *                        cleared/encrypted.
 *   payments           — financial records; not clinical PHI
 *   ledgerEntries      — financial ledger; not clinical PHI. Holds only amount /
 *                        type / invoiceId / optional free-text `note` — no
 *                        medication text or patient demographics.
 *   patientAccounts    — financial account records (patientId + balance); not
 *                        clinical PHI, no medication text.
 *   cashDrawers        — POS operational data; not PHI
 *   refunds            — Story 62.1 refund/void cash-out records (ids + money +
 *                        operational reason); financial, not clinical PHI —
 *                        PRESERVED for financial durability like invoices/payments.
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
  'refunds',
  'suppliers',
  'purchaseOrders',
  'stockCounts',
  'stockTransfers',
  'dataBudgetConfig',
  'dataUsage',
  // Story 57.4: stock reconciliation tasks — non-PHI ledger-drift records that
  // must survive logout until resolved by a manual adjustment.
  'stockReconciliationTasks',
  // Phase 2: enriched drug-catalog mirror + brands (non-PHI reference data)
  'drugCatalogMirror',
  'drugBrandsMirror',
  'drugBrandPresentationsMirror',
  'drugCatalogSyncMeta',
] as const

/**
 * Story 58.3 (mirrors lab-lite Task 2.2) — non-PHI operational tables NOT already
 * in PRESERVE_TABLES. Enumerated so the completeness guard
 * (phi-cleanup-completeness.test.ts) can assert every Dexie table is classified
 * as exactly one of: PHI (cleared/selective), preserved, or non-PHI. Adding a new
 * Dexie table without classifying it fails that test, forcing a cleanup decision.
 *
 * These are wholesale-B2B / procurement / inventory-location operational records.
 * They hold no PATIENT-linked clinical content:
 *   contractPrices        — negotiated wholesale price lists (B2B); no patient data
 *   customerAccounts      — WHOLESALE customer (business) accounts; not patients
 *   customerLedgerEntries — wholesale customer financial ledger; not patients
 *   salesOrders           — wholesale sales orders (B2B); not patient dispenses
 *   stockLocations        — physical stock location registry; operational
 *   supplierInvoices      — supplier (upstream) invoices; procurement, not patient
 *   supplierItems         — supplier catalog mappings; reference data
 *   supplierPayments      — payments to suppliers; procurement, not patient
 *   wholesaleCustomers    — B2B customer registry (businesses); not patients
 *   wholesalePullMeta     — wholesale sync metadata; operational
 */
export const NON_PHI_TABLES = [
  'contractPrices',
  'customerAccounts',
  'customerLedgerEntries',
  'salesOrders',
  'stockLocations',
  'supplierInvoices',
  'supplierItems',
  'supplierPayments',
  'wholesaleCustomers',
  'wholesalePullMeta',
] as const

// Compile-time safety: ensure syncQueue is never accidentally added to PHI_TABLES
type AssertNotInPhi<T extends string> = T extends (typeof PHI_TABLES)[number] ? never : T
type _SyncQueueSafe = AssertNotInPhi<'syncQueue'>

/**
 * Story 57.3 (H-PHARM-1, AC #2): tables that must be cleared SELECTIVELY, never
 * blanket-cleared, because they may hold the only durable copy of an unsynced
 * safety-critical record. `dispenses` (and its `dispenseAuditLog`) are cleared
 * only for records already confirmed on the Hub (a 'synced' sync-queue entry);
 * unsynced dispenses are preserved so an offline shift + expired token never
 * destroys the record. These are handled by preserveUnsyncedDispenses(), NOT the
 * blanket loop in clearPhiTables().
 *
 * Compile-time guard: the selective-clear tables MUST NOT also appear in the
 * blanket-clear list (BLANKET_CLEAR_PHI_TABLES) below, or the blanket loop would
 * destroy the unsynced records the selective clear is meant to preserve.
 */
export const SELECTIVE_CLEAR_TABLES = ['dispenses', 'dispenseAuditLog'] as const
type SelectiveClearTable = (typeof SELECTIVE_CLEAR_TABLES)[number]

/** PHI tables that are safe to blanket-clear (everything except the selective ones). */
export const BLANKET_CLEAR_PHI_TABLES = PHI_TABLES.filter(
  (t): t is Exclude<(typeof PHI_TABLES)[number], SelectiveClearTable> =>
    !(SELECTIVE_CLEAR_TABLES as readonly string[]).includes(t),
)

// Compile-time safety: a selective-clear table must never be blanket-cleared.
type AssertNotBlanket<T extends string> =
  T extends (typeof BLANKET_CLEAR_PHI_TABLES)[number] ? never : T
type _DispensesNotBlanket = AssertNotBlanket<'dispenses'>
type _DispenseAuditNotBlanket = AssertNotBlanket<'dispenseAuditLog'>

/**
 * Clear only the dispenses (and their audit-log entries) that are confirmed synced
 * to the Hub, preserving unsynced records. A dispense is "synced" when a sync-queue
 * entry with status 'synced' exists for it (matched by resourceId === dispense.id;
 * the id is stored in cleartext, the payload is encrypted).
 *
 * Never throws — swallows errors to avoid blocking logout/tab-close.
 */
export async function preserveUnsyncedDispenses(): Promise<void> {
  try {
    // Ids the Hub has confirmed (a 'synced' queue entry) — safe to purge locally.
    const syncedEntries = await db.syncQueue
      .where('status')
      .equals('synced')
      .toArray()
    const syncedDispenseIds = new Set(
      syncedEntries
        .filter((e) => e.resourceType === 'MedicationDispense')
        .map((e) => e.resourceId),
    )

    if (syncedDispenseIds.size === 0) return // nothing confirmed → preserve all

    // Delete only confirmed-synced dispenses; unsynced ones remain for the drain.
    await db.dispenses.bulkDelete(Array.from(syncedDispenseIds))

    // Purge audit-log rows for the deleted dispenses; keep rows for preserved ones.
    const auditRows = await db.dispenseAuditLog
      .where('dispenseId')
      .anyOf(Array.from(syncedDispenseIds))
      .primaryKeys()
    if (auditRows.length > 0) {
      await db.dispenseAuditLog.bulkDelete(auditRows)
    }
  } catch {
    // Non-fatal — on failure we preserve (do not destroy) the records.
  }
}

/**
 * Clear PHI tables from IndexedDB.
 * Fires all clears in parallel for speed (important for beforeunload).
 * Never throws — swallows errors to avoid blocking logout/tab-close.
 *
 * Story 57.3 (AC #2): `dispenses` / `dispenseAuditLog` are NOT blanket-cleared —
 * they are cleared selectively via preserveUnsyncedDispenses() so an unsynced
 * dispense (offline shift + expired token) is never destroyed as the only copy.
 */
export async function clearPhiTables(): Promise<void> {
  await Promise.allSettled([
    ...BLANKET_CLEAR_PHI_TABLES.map((tableName) => {
      try {
        const table = db.table(tableName)
        return table.clear()
      } catch {
        // Table may not exist in this schema version — skip gracefully.
        return Promise.resolve()
      }
    }),
    // Selective clear: only synced dispenses are purged; unsynced ones preserved.
    preserveUnsyncedDispenses(),
  ])
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
 * Verify that blanket-clear PHI tables are empty.
 * Used on session start to detect incomplete cleanup from a previous session.
 * Returns true if all blanket-clear PHI tables are empty, false if stale data exists.
 *
 * Story 57.3 (AC #2): `dispenses` / `dispenseAuditLog` are EXCLUDED from this check
 * — they are cleared selectively and may legitimately retain unsynced records after
 * cleanup. Including them would report "dirty" and could trigger a force-clear that
 * destroys the very records preserveUnsyncedDispenses() protected.
 */
export async function verifyPhiCleanup(): Promise<boolean> {
  try {
    const counts = await Promise.all(
      BLANKET_CLEAR_PHI_TABLES.map((tableName) => db.table(tableName).count()),
    )
    return counts.every((c) => c === 0)
  } catch {
    // If we can't verify, assume dirty — caller should force-clear
    return false
  }
}

import { db } from './db'

/**
 * PHI cleanup lifecycle — OPD Lite semantics (Story 59.3, Task 3 / H-OPD-5).
 *
 * DECISION (settled post-Story 61.2): tab close / ordinary refresh wipes the
 * in-memory encryption KEY ONLY; the encrypted PHI tables below are cleared only
 * on EXPLICIT auth-expiry or logout — never on refresh.
 *
 * Why key-wipe-only on tab close is safe *and* required here (unlike lab/pharmacy):
 * - OPD Lite is offline-first. The clinical cache in these tables MUST survive a
 *   refresh so a clinician can keep working with the ethernet cable pulled. Story
 *   61.2 made the at-rest key non-derivable (dual-wrapped DEK; offline PIN /
 *   online hub-secret unlock), so a refresh re-opens the SAME DEK from the persisted
 *   wrapped bundle while the session is valid — the data stays both encrypted at
 *   rest and usable. Wiping the tables on every `beforeunload` would destroy that
 *   cache and break offline-first (the exact regression this task must avoid).
 * - The "tab close → encrypted cache cleared" requirement (CLAUDE.md, Encryption)
 *   is satisfied by wiping the key: `encryption-key-store.ts` registers a
 *   `beforeunload` → `encryptionKeyStore.wipe()` hook, so on close the RAM key is
 *   gone and the on-disk blobs are opaque ciphertext until re-authentication.
 *
 * Where the PHI tables ARE cleared (the explicit end-of-session paths):
 * - Logout: `AuthGuard.handleSignOut`, `nav-user`, `UserDropdown` → `clearPhiTables()`
 *   + `encryptionKeyStore.wipe()` + `clearSession()`.
 * - Auth-expiry (inactivity / max-duration): `SessionTimeoutWrapper.handleExpired`
 *   → PHI store clears + `clearSyncedQueueEntries()` + key wipe + `clearSession()`.
 * - Logout also triggers `key-lifecycle-hooks.ts`, which wipes the key when the
 *   auth store flips to unauthenticated.
 *
 * Consequently OPD Lite intentionally has NO `PhiCleanupGuard` component. The dead,
 * never-mounted guard (which cleared PHI on `beforeunload`) was removed in Story
 * 59.3 rather than mounted, because mounting it would have wiped the offline cache
 * on every refresh. (lab-lite / pharmacy-lite keep their own guards — those apps are
 * push-only / transient staging surfaces with no offline-first cache to preserve.)
 */

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
  'diagnosticReportObservations', // Structured lab result observations (analyte values, reference ranges) tied to a patient's report — PHI, must be wiped on session end
  'serviceRequests', // Lab orders: patient-linked (subject.reference) with encrypted clinical reasonCode/note
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
  'pharmaciesMirror', // pharmacy directory — non-PHI reference data
  'labsMirror',       // lab directory — non-PHI reference data
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

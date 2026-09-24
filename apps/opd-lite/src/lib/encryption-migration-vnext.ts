/**
 * Story 61.2 — field-data migration from the legacy scheme to the vNext DEK.
 *
 * After a successful vNext ONLINE unlock the key store holds:
 *   - the vNext DEK as the current write version 'v2', and
 *   - the legacy PBKDF2(sub, salt) key as decrypt-only 'v1'.
 *
 * The Dexie encryption proxy DECRYPTS reads using the full key map (so legacy 'v1'
 * blobs read fine) and ENCRYPTS writes under the current write version ('v2'). So
 * re-encrypting a record is simply: read it (decrypts v1 or v2) and write it back
 * (encrypts v2). Running this over every PHI row upgrades all legacy data.
 *
 * Properties:
 *   - Resumable: a per-table completion marker is persisted; a re-run skips
 *     already-migrated tables and, within a table, re-writing a v2 row is a
 *     harmless no-op re-encryption.
 *   - Safe: reads go through the same decrypt path used everywhere; a row that
 *     cannot be decrypted (corrupt/foreign key) is skipped, never dropped or
 *     written as plaintext.
 *   - No PHI in logs: only table names and counts are logged.
 */

import { db } from './db'
import { encryptionKeyStore } from './encryption-key-store'
import { VNEXT_WRITE_VERSION } from './encryption-key-vnext'

const MIGRATION_DONE_KEY = 'ultranos:dek-migration:v2:done'

/** PHI tables carrying encrypted (_enc) blobs — must match db.ts PHI_TABLE_CONFIGS. */
const PHI_TABLES = [
  'patients',
  'encounters',
  'soapLedger',
  'observations',
  'conditions',
  'medications',
  'serviceRequests',
  'allergyIntolerances',
  'medicationStatements',
  'interactionAuditLog',
  'appointments',
  'practitionerKeys',
  'diagnosticReports',
  'diagnosticReportObservations',
] as const

function loadDoneSet(): Set<string> {
  try {
    const raw = localStorage.getItem(MIGRATION_DONE_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveDoneSet(done: Set<string>): void {
  try {
    localStorage.setItem(MIGRATION_DONE_KEY, JSON.stringify([...done]))
  } catch {
    // Marker not persisted — the migration re-runs next login (idempotent), no harm.
  }
}

/**
 * Re-encrypt all legacy (v1) PHI records under the vNext DEK (v2). Resumable and
 * idempotent. Only runs when the current write version is the vNext version and
 * both keys are present. Returns the number of records re-written.
 */
export async function migrateLegacyEncryptedData(): Promise<number> {
  // Guard: only run under the vNext scheme with a usable key.
  if (encryptionKeyStore.getCurrentWriteVersion() !== VNEXT_WRITE_VERSION) return 0
  if (!encryptionKeyStore.isReady()) return 0

  const done = loadDoneSet()
  let rewritten = 0

  for (const tableName of PHI_TABLES) {
    if (done.has(tableName)) continue

    const table = (db as unknown as Record<string, {
      toArray: () => Promise<unknown[]>
      bulkPut: (items: unknown[]) => Promise<unknown>
    }>)[tableName]
    if (!table) continue

    try {
      // Reads decrypt under the full key map (legacy v1 + vNext v2).
      const rows = (await table.toArray()) as unknown[]
      if (rows.length > 0) {
        // Writes encrypt under the current write version (v2). Chunk to bound memory.
        const CHUNK = 200
        for (let i = 0; i < rows.length; i += CHUNK) {
          const slice = rows.slice(i, i + CHUNK)
          await table.bulkPut(slice)
          rewritten += slice.length
        }
      }
      done.add(tableName)
      saveDoneSet(done)
    } catch {
      // A table that fails (e.g. a corrupt row) is left for the next attempt.
      // Do not mark it done; do not drop rows; never write plaintext.
      console.warn(`[crypto] vNext migration deferred for table (will retry): ${tableName}`)
    }
  }

  return rewritten
}

/** Test/ops helper: clear the resumable completion markers so migration re-runs. */
export function resetMigrationMarkers(): void {
  try {
    localStorage.removeItem(MIGRATION_DONE_KEY)
  } catch {
    /* noop */
  }
}

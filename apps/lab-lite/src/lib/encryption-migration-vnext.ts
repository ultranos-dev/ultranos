/**
 * Story 58.3 (H-LAB-1) — startup migration that encrypts pre-existing PLAINTEXT
 * PHI rows in lab-lite's Dexie DB.
 *
 * Unlike opd-lite/pharmacy-lite (which have always encrypted their PHI store and
 * only ever needed a v1→v2 key-rotation migration), lab-lite historically stored
 * PHI in plaintext. After Story 58.3 wires the field-encryption middleware, any
 * row written before this release has no `_enc` blob. This migration reads those
 * legacy plaintext rows from the RAW (un-proxied) table and re-writes each one
 * through the encrypting proxy, which produces the `_enc` blob under the current
 * write key/version.
 *
 * Properties:
 *  - Runs only after the session key is available (post-login).
 *  - Resumable: a per-table completion marker in localStorage lets it pick up
 *    where it left off after an interrupted run.
 *  - Idempotent: rows that already carry `_enc` are skipped; re-running is a no-op.
 *  - Never writes plaintext: it only ever re-writes THROUGH the encrypting proxy.
 *  - Never throws: failures leave the marker unset so the next login retries.
 *  - No PHI in logs: only opaque table names / counts are logged.
 */

import { getDb, ENCRYPTED_PHI_TABLES, _getRawPhiTable } from './db'
import { encryptionKeyStore } from './encryption-key-store'

const MIGRATION_DONE_KEY = 'ultranos:lab:phi-encryption:done'

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
    /* marker not persisted — migration re-runs next login (idempotent) */
  }
}

let _migrationInFlight = false

/**
 * Encrypt any pre-existing plaintext PHI rows. Returns the number of records
 * re-written. Safe to call at app startup; returns 0 immediately if the key is
 * not yet available (caller should retry after the key is installed).
 */
export async function migratePlaintextPhiToEncrypted(): Promise<number> {
  if (!encryptionKeyStore.isReady()) return 0
  if (_migrationInFlight) return 0
  _migrationInFlight = true

  try {
    const db = getDb()
    const done = loadDoneSet()
    let rewritten = 0

    for (const tableName of ENCRYPTED_PHI_TABLES) {
      if (done.has(tableName)) continue

      const rawTable = _getRawPhiTable(tableName)
      const proxied = (db as unknown as Record<string, {
        bulkPut: (items: unknown[]) => Promise<unknown>
      }>)[tableName]
      if (!rawTable || !proxied) {
        // Table absent in this schema version — nothing to migrate.
        done.add(tableName)
        saveDoneSet(done)
        continue
      }

      try {
        // Read RAW rows (bypasses the decrypting proxy so we can detect legacy
        // plaintext rows, which have no `_enc` field).
        const all = (await rawTable.toArray()) as Array<Record<string, unknown>>
        const plaintext = all.filter((r) => r != null && !('_enc' in r))

        if (plaintext.length > 0) {
          const CHUNK = 200
          for (let i = 0; i < plaintext.length; i += CHUNK) {
            const slice = plaintext.slice(i, i + CHUNK)
            // Re-write through the encrypting proxy → produces `_enc` blobs.
            await proxied.bulkPut(slice)
            rewritten += slice.length
          }
        }

        done.add(tableName)
        saveDoneSet(done)
      } catch {
        // Non-fatal — leave this table unmarked so the next login retries.
        // No PHI logged (opaque table name only).
        console.warn(`[58.3] PHI encryption migration deferred for table (will retry): ${tableName}`)
      }
    }

    return rewritten
  } finally {
    _migrationInFlight = false
  }
}

/** Test/ops helper: clear the resumable completion markers so migration re-runs. */
export function resetPhiEncryptionMigrationMarkers(): void {
  try {
    localStorage.removeItem(MIGRATION_DONE_KEY)
  } catch {
    /* noop */
  }
}

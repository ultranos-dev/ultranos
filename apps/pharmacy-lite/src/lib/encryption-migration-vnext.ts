/**
 * Story 61.2 — field-data migration from the legacy scheme to the vNext DEK
 * (pharmacy-lite). See opd-lite's equivalent for the full rationale.
 *
 * After a vNext ONLINE unlock the key store holds the vNext DEK as write version
 * 'v2' and the legacy PBKDF2(sub, salt) key as decrypt-only 'v1'. The Dexie
 * encryption proxy decrypts reads with the full key map and encrypts writes under
 * the current write version, so reading each PHI row and writing it back upgrades
 * v1 → v2. Resumable (per-table marker), idempotent, never writes plaintext.
 */

import { db } from './db'
import { encryptionKeyStore } from './encryption-key-store'
import { VNEXT_WRITE_VERSION } from './encryption-key-vnext'

const MIGRATION_DONE_KEY = 'ultranos:dek-migration:v2:done'

/** PHI tables carrying encrypted (_enc) blobs — must match db.ts PHI_TABLE_CONFIGS. */
const PHI_TABLES = [
  'dispenses',
  'dispenseAuditLog',
  'patients',
  'patientAllergyCache',
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
    /* marker not persisted — migration re-runs next login (idempotent) */
  }
}

/**
 * Re-encrypt all legacy (v1) PHI records under the vNext DEK (v2). Resumable and
 * idempotent. Returns the number of records re-written.
 */
export async function migrateLegacyEncryptedData(): Promise<number> {
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
      const rows = (await table.toArray()) as unknown[]
      if (rows.length > 0) {
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

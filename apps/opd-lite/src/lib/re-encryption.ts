/**
 * Background re-encryption job for OPD-Lite IndexedDB PHI records.
 *
 * After a key rotation (Story 28.5), old-version records must be re-encrypted
 * with the new key so the old key can eventually be retired. This utility:
 *   1. Reads records in batches (cursor-based) from each PHI table — decrypted
 *      transparently by the Dexie middleware using the full key map.
 *   2. Writes each batch back via bulkPut (re-encrypted with the current write key).
 *   3. Checkpoints progress after every batch in localStorage so the job resumes
 *      at the exact batch offset if the tab closes mid-run.
 *   4. On completion: signals that the old key version can be retired.
 *
 * Usage (triggered by admin action or key-compromise remediation — NOT on every login):
 *   const job = createReEncryptionJob(db, PHI_TABLE_NAMES, 'v1', 'v2')
 *   await job.run()
 *   encryptionKeyStore.retireVersion('v1')
 *
 * ⚠️ Never auto-trigger this on login — key rotation is a rare, explicit admin event.
 */

import type Dexie from 'dexie'
import { encryptionKeyStore } from './encryption-key-store'

const BATCH_SIZE = 100
const PROGRESS_KEY_PREFIX = 'ultranos:reenc-progress:'

export interface ReEncryptionProgress {
  fromVersion: string
  toVersion: string
  tablesCompleted: string[]
  totalTables: number
  startedAt: string
  /** Table currently being processed (for batch-level resume). */
  currentTable?: string
  /** First unprocessed row index within currentTable (offset into cursor scan). */
  currentTableOffset?: number
}

function progressKey(fromVersion: string, toVersion: string): string {
  return `${PROGRESS_KEY_PREFIX}${fromVersion}->${toVersion}`
}

function loadProgress(
  fromVersion: string,
  toVersion: string,
): ReEncryptionProgress | null {
  try {
    const stored = localStorage.getItem(progressKey(fromVersion, toVersion))
    if (stored) return JSON.parse(stored) as ReEncryptionProgress
  } catch {
    // localStorage unavailable
  }
  return null
}

function saveProgress(progress: ReEncryptionProgress): void {
  try {
    localStorage.setItem(
      progressKey(progress.fromVersion, progress.toVersion),
      JSON.stringify(progress),
    )
  } catch {
    // localStorage unavailable — progress tracking degraded; job will restart from scratch next session
  }
}

function clearProgress(fromVersion: string, toVersion: string): void {
  try {
    localStorage.removeItem(progressKey(fromVersion, toVersion))
  } catch {
    // ignore
  }
}

export interface ReEncryptionJob {
  /** Run the job to completion (or until interrupted by tab close). */
  run(): Promise<ReEncryptionResult>
}

export interface ReEncryptionResult {
  /** Tables that were successfully re-encrypted in this run. */
  tablesConverted: string[]
  /** Tables that were already done from a previous run. */
  tablesSkipped: string[]
  /** Whether all tables are now fully re-encrypted. */
  complete: boolean
}

/**
 * Create a re-encryption job for the given PHI table names.
 *
 * @param db               The Dexie database instance with encryption middleware applied.
 * @param phiTableNames    Names of PHI tables to re-encrypt (order determines processing order).
 * @param fromVersion      The old key version being rotated away from, e.g. "v1".
 * @param toVersion        The new write version, e.g. "v2" — must already be in the key store.
 */
export function createReEncryptionJob(
  db: Dexie,
  phiTableNames: string[],
  fromVersion: string,
  toVersion: string,
): ReEncryptionJob {
  return {
    async run(): Promise<ReEncryptionResult> {
      // Validate key store state before starting
      const currentVersion = encryptionKeyStore.getCurrentWriteVersion()
      if (currentVersion !== toVersion) {
        throw new Error(
          `Re-encryption requires current write version to be "${toVersion}" but got "${currentVersion}"`,
        )
      }
      const keyMap = encryptionKeyStore.requireKeyMap()
      if (!keyMap[fromVersion]) {
        throw new Error(
          `Re-encryption requires old key "${fromVersion}" to still be in the key store`,
        )
      }

      // Load or initialise progress
      let progress =
        loadProgress(fromVersion, toVersion) ??
        ({
          fromVersion,
          toVersion,
          tablesCompleted: [],
          totalTables: phiTableNames.length,
          startedAt: new Date().toISOString(),
        } satisfies ReEncryptionProgress)

      const tablesConverted: string[] = []
      const tablesSkipped: string[] = []

      for (const tableName of phiTableNames) {
        if (progress.tablesCompleted.includes(tableName)) {
          tablesSkipped.push(tableName)
          continue
        }

        // Resume from saved batch offset, or start from 0
        const startOffset =
          progress.currentTable === tableName
            ? (progress.currentTableOffset ?? 0)
            : 0

        await reEncryptTable(
          db,
          tableName,
          startOffset,
          async (nextOffset) => {
            progress = {
              ...progress,
              currentTable: tableName,
              currentTableOffset: nextOffset,
            }
            saveProgress(progress)
          },
        )

        progress = {
          ...progress,
          tablesCompleted: [...progress.tablesCompleted, tableName],
          currentTable: undefined,
          currentTableOffset: undefined,
        }
        saveProgress(progress)
        tablesConverted.push(tableName)

        // Yield to the event loop between tables to keep UI responsive
        await yieldToEventLoop()
      }

      const complete = progress.tablesCompleted.length === phiTableNames.length
      if (complete) {
        clearProgress(fromVersion, toVersion)
      }

      return { tablesConverted, tablesSkipped, complete }
    },
  }
}

/**
 * Re-encrypt all records in a single table using cursor-based pagination.
 *
 * Reads through the Dexie middleware proxy using `toCollection().offset().limit()`,
 * so the key map is used for decryption (v1 and v2 records can be read).
 * Writes via `bulkPut()` through the same proxy, re-encrypting with the current
 * write key. Checkpoints after each batch via `onBatchComplete`.
 */
async function reEncryptTable(
  db: Dexie,
  tableName: string,
  startOffset: number,
  onBatchComplete: (nextOffset: number) => Promise<void>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (db as any)[tableName] as {
    toCollection(): {
      offset(n: number): {
        limit(m: number): { toArray(): Promise<unknown[]> }
      }
    }
    bulkPut(items: unknown[]): Promise<unknown>
  } | undefined

  if (!table) {
    console.warn(`[re-encryption] Table "${tableName}" not found — skipping`)
    return
  }

  let offset = startOffset

  for (;;) {
    // Cursor-based read: fetch one batch at a time through the middleware proxy.
    // The proxy decrypts using the full key map, so both v1 and v2 records are readable.
    const batch = await table.toCollection().offset(offset).limit(BATCH_SIZE).toArray()

    if (batch.length === 0) break

    // Re-encrypt: bulkPut goes through the proxy write path which uses the current
    // write key and version (e.g. v2), overwriting the old-version ciphertext in IDB.
    await table.bulkPut(batch)

    offset += batch.length

    // Checkpoint after each batch so a tab-close resumes here, not at the table start.
    await onBatchComplete(offset)
    await yieldToEventLoop()

    if (batch.length < BATCH_SIZE) break  // last batch — no more records
  }
}

/** Yield to the browser event loop so UI frames can render between batches. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

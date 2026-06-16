/**
 * Dexie adapter for the sync-engine SyncQueueStorage interface.
 *
 * Bridges pharmacy-lite's Dexie syncQueue table to the platform-agnostic
 * sync-engine queue. Handles the status value mismatch: pharmacy db.ts
 * uses 'in-flight' while sync-engine uses 'syncing'.
 *
 * Encryption (Story 28.3): createDexieSyncAdapter() accepts an optional
 * encryptFn so that payloads without the enc:v1: prefix are encrypted on
 * put(). This avoids double-encrypting entries that are already encrypted.
 */

import { ENCRYPTED_PAYLOAD_PREFIX, type SyncQueueStorage, type SyncQueueEntry } from '@ultranos/sync-engine'
import { decryptPayload } from '@ultranos/crypto'
import { db, type SyncQueueEntry as DexieSyncQueueEntry } from './db'
import { encryptionKeyStore } from './encryption-key-store'

export type PharmacyEncryptFn = (jsonPayload: string) => Promise<string>

/** Map sync-engine status values to Dexie status values. */
function toDbStatus(status: string): string {
  return status === 'syncing' ? 'in-flight' : status
}

/** Map Dexie status values to sync-engine status values. */
function fromDbStatus(status: string): SyncQueueEntry['status'] {
  if (status === 'in-flight') return 'syncing'
  return status as SyncQueueEntry['status']
}

function fromDbEntry(entry: DexieSyncQueueEntry): SyncQueueEntry {
  return {
    ...entry,
    action: entry.action as SyncQueueEntry['action'],
    status: fromDbStatus(entry.status),
  }
}

function toDbEntry(entry: SyncQueueEntry): DexieSyncQueueEntry {
  return {
    ...entry,
    status: toDbStatus(entry.status) as DexieSyncQueueEntry['status'],
  }
}

/**
 * Create a Dexie SyncQueueStorage adapter with optional payload encryption.
 * When encryptFn is provided, put() encrypts any payload that does not
 * already carry the enc:v1: prefix (avoiding double-encryption on status updates).
 *
 * Error contract: if encryptFn rejects, put() propagates the error rather than
 * storing plaintext PHI. Callers (enqueueSyncAction) have a top-level try/catch
 * that swallows queue failures without crashing clinical workflows.
 */
export function createDexieSyncAdapter(encryptFn?: PharmacyEncryptFn): SyncQueueStorage {
  return {
    async put(entry: SyncQueueEntry): Promise<void> {
      let { payload } = entry
      if (encryptFn && !payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
        payload = await encryptFn(payload) // intentionally propagates — do not store plaintext on failure
      }
      await db.syncQueue.put(toDbEntry({ ...entry, payload }))
    },

    async getByResourceId(resourceId: string, status: string): Promise<SyncQueueEntry | null> {
      const dbStatus = toDbStatus(status)
      const entry = await db.syncQueue
        .where({ resourceId, status: dbStatus })
        .first()
      return entry ? fromDbEntry(entry) : null
    },

    async getByStatus(status: string): Promise<SyncQueueEntry[]> {
      const dbStatus = toDbStatus(status)
      const entries = await db.syncQueue
        .where('status')
        .equals(dbStatus)
        .toArray()
      return entries.map(fromDbEntry)
    },

    async delete(id: string): Promise<void> {
      await db.syncQueue.delete(id)
    },

    async count(status: string): Promise<number> {
      const dbStatus = toDbStatus(status)
      return db.syncQueue.where('status').equals(dbStatus).count()
    },

    async getLatestSynced(): Promise<SyncQueueEntry | null> {
      const synced = await db.syncQueue
        .where('status')
        .equals('synced')
        .toArray()
      if (synced.length === 0) return null
      synced.sort((a, b) => {
        const aTime = a.lastAttemptAt ? new Date(a.lastAttemptAt).getTime() : 0
        const bTime = b.lastAttemptAt ? new Date(b.lastAttemptAt).getTime() : 0
        return bTime - aTime
      })
      const first = synced[0]
      return first ? fromDbEntry(first) : null
    },
  }
}

/**
 * Decrypt a pharmacy sync queue entry payload in memory before Hub push.
 * Returns plaintext JSON for legacy unencrypted entries unchanged.
 */
export async function decryptPharmacyEntryPayload(payload: string): Promise<string> {
  if (!payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
    return payload
  }
  const versionedCiphertext = payload.slice(ENCRYPTED_PAYLOAD_PREFIX.length)
  const keyMap = encryptionKeyStore.requireKeyMap()
  const decrypted = await decryptPayload(keyMap, versionedCiphertext)
  return typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)
}

/** Default adapter without encryption (backward-compatible singleton). */
export const dexieSyncAdapter: SyncQueueStorage = {
  async put(entry: SyncQueueEntry): Promise<void> {
    await db.syncQueue.put(toDbEntry(entry))
  },

  async getByResourceId(resourceId: string, status: string): Promise<SyncQueueEntry | null> {
    const dbStatus = toDbStatus(status)
    const entry = await db.syncQueue
      .where({ resourceId, status: dbStatus })
      .first()
    return entry ? fromDbEntry(entry) : null
  },

  async getByStatus(status: string): Promise<SyncQueueEntry[]> {
    const dbStatus = toDbStatus(status)
    const entries = await db.syncQueue
      .where('status')
      .equals(dbStatus)
      .toArray()
    return entries.map(fromDbEntry)
  },

  async delete(id: string): Promise<void> {
    await db.syncQueue.delete(id)
  },

  async count(status: string): Promise<number> {
    const dbStatus = toDbStatus(status)
    return db.syncQueue.where('status').equals(dbStatus).count()
  },

  async getLatestSynced(): Promise<SyncQueueEntry | null> {
    const synced = await db.syncQueue
      .where('status')
      .equals('synced')
      .toArray()
    if (synced.length === 0) return null
    synced.sort((a, b) => {
      const aTime = a.lastAttemptAt ? new Date(a.lastAttemptAt).getTime() : 0
      const bTime = b.lastAttemptAt ? new Date(b.lastAttemptAt).getTime() : 0
      return bTime - aTime
    })
    const first = synced[0]
    return first ? fromDbEntry(first) : null
  },
}

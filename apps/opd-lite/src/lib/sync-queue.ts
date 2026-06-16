/**
 * OPD-Lite sync queue singleton.
 *
 * Wires the generic sync-engine queue to the Dexie syncQueue table.
 * Imported by stores to enqueue sync operations on local writes.
 *
 * Encryption (Story 28.3):
 * - Payloads are encrypted with the session key before IndexedDB storage.
 * - Stored format: enc:<version>:<base64> (ENCRYPTED_PAYLOAD_PREFIX + versioned AES-GCM payload).
 * - If the session key is unavailable at enqueue time, payload is stored as plaintext
 *   and encrypted in-place on next startup by the migration utility.
 */

import {
  createSyncQueue,
  ENCRYPTED_PAYLOAD_PREFIX,
  type SyncQueueStorage,
  type SyncQueueEntry,
  type SyncQueue,
} from '@ultranos/sync-engine'
import { encryptPayload, decryptPayload } from '@ultranos/crypto'
import { db } from './db'
import { encryptionKeyStore } from './encryption-key-store'

/** Dexie-backed storage adapter for the sync queue. */
const dexieStorage: SyncQueueStorage = {
  async put(entry: SyncQueueEntry) {
    await db.syncQueue.put(entry)
  },

  async getByResourceId(resourceId: string, status: string) {
    return (
      (await db.syncQueue
        .where('resourceId')
        .equals(resourceId)
        .filter((e) => e.status === status)
        .first()) ?? null
    )
  },

  async getByStatus(status: string) {
    return db.syncQueue.where('status').equals(status).toArray()
  },

  async delete(id: string) {
    await db.syncQueue.delete(id)
  },

  async count(status: string) {
    return db.syncQueue.where('status').equals(status).count()
  },

  async getLatestSynced() {
    const synced = await db.syncQueue
      .where('status')
      .equals('synced')
      .toArray()
    if (synced.length === 0) return null
    synced.sort((a, b) => (b.lastAttemptAt ?? b.createdAt).localeCompare(a.lastAttemptAt ?? a.createdAt))
    return synced[0] ?? null
  },
}

const rawQueue = createSyncQueue(dexieStorage)

/**
 * Queue proxy that transparently encrypts payloads on enqueue.
 * All other queue operations delegate to the underlying queue unchanged.
 */
export const syncQueue: SyncQueue = {
  ...rawQueue,
  async enqueue(input) {
    const key = encryptionKeyStore.getKey()
    if (key && !input.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
      try {
        const encryptedBase64 = await encryptPayload(key, input.payload)
        return rawQueue.enqueue({
          ...input,
          payload: `${ENCRYPTED_PAYLOAD_PREFIX}${encryptedBase64}`,
        })
      } catch {
        // Encryption failed (e.g. SubtleCrypto unavailable, key revoked mid-call).
        // Fall through to store plaintext — startup migration will encrypt on next login.
        console.warn('[sync-queue] encryptPayload failed; storing plaintext for migration')
      }
    }
    return rawQueue.enqueue(input)
  },
}

/**
 * Decrypt a sync queue entry payload in memory before Hub push.
 * Returns the original JSON string for plaintext (legacy) entries unchanged.
 * Used exclusively by the drain worker — decrypted value is never persisted.
 */
export async function decryptEntryPayload(payload: string): Promise<string> {
  if (!payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) {
    return payload
  }
  const versionedCiphertext = payload.slice(ENCRYPTED_PAYLOAD_PREFIX.length)
  const keyMap = encryptionKeyStore.requireKeyMap()
  const decrypted = await decryptPayload(keyMap, versionedCiphertext)
  return typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted)
}

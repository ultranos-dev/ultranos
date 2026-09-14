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
  type EnqueueInput,
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

/**
 * A serialized HLC is "<15-digit wallMs>:<5-digit counter>:<nodeId>" (see
 * serializeHlc in @ultranos/sync-engine). Every opd-lite write stamps one via
 * hlc.now(); an ISO date, a stale reuse, or an empty value here causes the Hub
 * to mis-parse the clock and silently drop the write. Reject it at the source.
 */
const SERIALIZED_HLC_RE = /^\d{15}:\d{5}:.+/

function assertSerializedHlc(hlcTimestamp: string): void {
  if (SERIALIZED_HLC_RE.test(hlcTimestamp)) return
  const msg =
    '[sync-queue] hlcTimestamp is not a serialized HLC ("<15d>:<5d>:<node>"). ' +
    'Use serializeHlc(hlc.now()); an ISO date or empty value causes silent Hub sync failures.'
  // Fail loud in dev/test so CI catches the regression; in production, warn
  // (no PHI) but never block a durable clinical write on a format check.
  if (process.env.NODE_ENV !== 'production') throw new Error(msg)
  console.warn(msg)
}

// Late-bound so sync-worker can attach requestDrain after the worker is constructed.
let onEnqueuedBridge: ((input: EnqueueInput) => void) | null = null
export function setOnEnqueuedBridge(fn: typeof onEnqueuedBridge): void {
  onEnqueuedBridge = fn
}

const rawQueue = createSyncQueue(dexieStorage, undefined, {
  onEnqueued: (input) => { try { onEnqueuedBridge?.(input) } catch { /* never block enqueue */ } },
})

/**
 * Queue proxy that transparently encrypts payloads on enqueue.
 * All other queue operations delegate to the underlying queue unchanged.
 */
export const syncQueue: SyncQueue = {
  ...rawQueue,
  async enqueue(input) {
    assertSerializedHlc(input.hlcTimestamp)
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

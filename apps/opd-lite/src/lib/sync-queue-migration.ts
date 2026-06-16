/**
 * Startup migration: encrypt unencrypted sync queue entries in-place.
 *
 * Story 28.3: on app startup, if the session key is available, scan the
 * sync queue for entries whose payload does NOT carry the enc:v1: prefix
 * (i.e. plaintext entries written before this story was deployed) and
 * encrypt them in-place.
 *
 * If the key is unavailable (fresh tab, re-auth pending) this migration
 * is deferred -- legacy plaintext entries will still drain correctly because
 * the drain worker handles both encrypted and plaintext payloads.
 */

import { ENCRYPTED_PAYLOAD_PREFIX } from '@ultranos/sync-engine'
import { encryptPayload } from '@ultranos/crypto'
import { db } from './db'
import { encryptionKeyStore } from './encryption-key-store'

/**
 * Encrypt all unencrypted pending/failed/awaiting-key entries in the sync queue.
 * Safe to call multiple times -- already-encrypted entries are skipped.
 * Never throws.
 */
export async function migrateUnencryptedQueueEntries(): Promise<void> {
  try {
    const key = encryptionKeyStore.getKey()
    if (!key) return

    const allEntries = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'failed', 'awaiting-key'])
      .toArray()

    for (const entry of allEntries) {
      if (entry.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) continue

      const encryptedBase64 = await encryptPayload(key, entry.payload)
      await db.syncQueue.put({
        ...entry,
        payload: `${ENCRYPTED_PAYLOAD_PREFIX}${encryptedBase64}`,
      })
    }
  } catch {
    // Migration must never crash the app
  }
}

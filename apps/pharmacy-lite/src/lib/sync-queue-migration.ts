/**
 * Startup / re-auth migration: encrypt unencrypted sync queue entries in-place.
 *
 * Story 28.3 (PHI-at-rest wiring): scan the sync queue for entries whose payload
 * does NOT carry the enc:v1: prefix — i.e. plaintext entries written before this
 * story was deployed, or entries deferred as 'awaiting-key' while the session key
 * was unavailable — and encrypt them in-place with the pharmacy session key.
 *
 * If the key is unavailable (fresh tab, re-auth pending) this migration is a
 * no-op; the drain worker's awaiting-key deferral keeps such entries from being
 * pushed until they are encrypted.
 */

import { ENCRYPTED_PAYLOAD_PREFIX } from '@ultranos/sync-engine'
import { db } from './db'
import { encryptionKeyStore } from './encryption-key-store'
import { pharmacyEncryptPayload } from './dexie-sync-adapter'

/**
 * Encrypt all unencrypted pending/failed/awaiting-key entries in the sync queue.
 * Safe to call multiple times — already-encrypted entries are skipped.
 * Never throws.
 */
export async function migrateUnencryptedQueueEntries(): Promise<void> {
  try {
    if (!encryptionKeyStore.isReady()) return

    const allEntries = await db.syncQueue
      .where('status')
      .anyOf(['pending', 'failed', 'awaiting-key'])
      .toArray()

    for (const entry of allEntries) {
      if (entry.payload.startsWith(ENCRYPTED_PAYLOAD_PREFIX)) continue

      const encryptedPayload = await pharmacyEncryptPayload(entry.payload)
      await db.syncQueue.put({ ...entry, payload: encryptedPayload })
    }
  } catch {
    // Migration must never crash the app.
  }
}

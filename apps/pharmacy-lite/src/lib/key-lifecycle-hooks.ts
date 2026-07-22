import { useAuthSessionStore } from '@/stores/auth-session-store'
import { encryptionKeyStore } from './encryption-key-store'
import { clearPhiTables } from './phi-cleanup'
import { createSyncQueue } from '@ultranos/sync-engine'
import { dexieSyncAdapter } from './dexie-sync-adapter'
import { migrateUnencryptedQueueEntries } from './sync-queue-migration'

/**
 * Subscribe to auth session changes:
 * - On logout: wipe the encryption key and clear PHI tables from IndexedDB.
 * - On re-authentication (key restored): encrypt any plaintext queue entries
 *   in-place, then reset awaiting-key entries to pending so the drain worker
 *   picks them up. Encryption MUST happen before restore so a PHI payload that
 *   was deferred while the key was unavailable is never drained as plaintext.
 *
 * Defence-in-depth:
 *   1. Key wipe  — encrypted IndexedDB data becomes unreadable immediately.
 *   2. Table clear — encrypted blobs are removed from the workstation.
 */
useAuthSessionStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    encryptionKeyStore.wipe()
    // Fire-and-forget — errors are swallowed inside clearPhiTables
    void clearPhiTables()
  }

  if (!prevState.isAuthenticated && state.isAuthenticated && encryptionKeyStore.isReady()) {
    // Encrypt-then-restore: encrypt any plaintext entries deferred while the
    // key was unavailable, then promote awaiting-key entries back to pending.
    void migrateUnencryptedQueueEntries().then(() => {
      const queue = createSyncQueue(dexieSyncAdapter)
      return queue.restoreAwaitingKeyEntries()
    })
  }
})

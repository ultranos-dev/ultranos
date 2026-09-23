import { useAuthSessionStore } from '../stores/auth-session-store'
import { encryptionKeyStore } from './encryption-key-store'
import { syncQueue, flushHeldEnqueues } from './sync-queue'
import { migrateUnencryptedQueueEntries } from './sync-queue-migration'
import { runPendingEncryptionMigrations } from './db'

/**
 * Subscribe to auth session changes:
 * - On logout: wipe the encryption key from memory so PHI becomes unreadable.
 * - On re-authentication (key restored):
 *   1. Encrypt + enqueue any payloads held in memory because the key was
 *      unavailable at enqueue time (Story 60.2 — no-plaintext-at-rest hold).
 *   2. Encrypt any legacy plaintext queue entries (Story 28.3 migration).
 *   3. Restore awaiting-key entries to pending so the drain worker picks them up.
 *   4. Run any pending DB table encryption migrations (Story 28.1).
 *   Ordering matters: migrate before restore so restored entries are already encrypted.
 */
useAuthSessionStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    encryptionKeyStore.wipe()
  }

  if (!prevState.isAuthenticated && state.isAuthenticated && encryptionKeyStore.isReady()) {
    void (async () => {
      await flushHeldEnqueues()
      await migrateUnencryptedQueueEntries()
      await syncQueue.restoreAwaitingKeyEntries()
      void runPendingEncryptionMigrations()
    })()
  }
})

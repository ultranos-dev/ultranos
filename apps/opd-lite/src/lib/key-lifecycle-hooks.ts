import { useAuthSessionStore } from '../stores/auth-session-store'
import { encryptionKeyStore } from './encryption-key-store'
import { syncQueue } from './sync-queue'
import { migrateUnencryptedQueueEntries } from './sync-queue-migration'
import { runPendingEncryptionMigrations } from './db'

/**
 * Subscribe to auth session changes:
 * - On logout: wipe the encryption key from memory so PHI becomes unreadable.
 * - On re-authentication (key restored):
 *   1. Encrypt any legacy plaintext queue entries (Story 28.3 migration).
 *   2. Restore awaiting-key entries to pending so the drain worker picks them up.
 *   3. Run any pending DB table encryption migrations (Story 28.1).
 *   Ordering matters: migrate before restore so restored entries are already encrypted.
 */
useAuthSessionStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    encryptionKeyStore.wipe()
  }

  if (!prevState.isAuthenticated && state.isAuthenticated && encryptionKeyStore.isReady()) {
    void (async () => {
      await migrateUnencryptedQueueEntries()
      await syncQueue.restoreAwaitingKeyEntries()
      void runPendingEncryptionMigrations()
    })()
  }
})

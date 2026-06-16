import { useAuthSessionStore } from '@/stores/auth-session-store'
import { encryptionKeyStore } from './encryption-key-store'
import { clearPhiTables } from './phi-cleanup'
import { createSyncQueue } from '@ultranos/sync-engine'
import { dexieSyncAdapter } from './dexie-sync-adapter'

/**
 * Subscribe to auth session changes:
 * - On logout: wipe the encryption key and clear PHI tables from IndexedDB.
 * - On re-authentication (key restored): scan for awaiting-key queue entries
 *   and reset them to pending so the drain worker picks them up.
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
    const queue = createSyncQueue(dexieSyncAdapter)
    void queue.restoreAwaitingKeyEntries()
  }
})

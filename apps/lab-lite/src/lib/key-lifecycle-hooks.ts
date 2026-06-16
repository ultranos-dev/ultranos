import { useAuthSessionStore } from '../stores/auth-session-store'
import { clearSessionEncryptionKey } from './consent-crypto'
import { clearPhiTables } from './phi-cleanup'

/**
 * Subscribe to auth session changes: when the user logs out
 * (session becomes null / isAuthenticated → false), clear the session
 * encryption key and wipe all PHI tables from IndexedDB.
 *
 * Lab-Lite uses a module-level session key via consent-crypto for
 * AES-GCM encryption of consent blobs (audio/thumbprint). Clearing
 * it ensures those encrypted blobs are permanently unreadable after logout.
 *
 * Defence-in-depth:
 *   1. Key clear — consent blobs in IndexedDB become unreadable immediately.
 *   2. Table clear — all patient-linked tables are removed from the workstation.
 */
useAuthSessionStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    clearSessionEncryptionKey()
    // Fire-and-forget — errors are swallowed inside clearPhiTables
    void clearPhiTables()
  }
})

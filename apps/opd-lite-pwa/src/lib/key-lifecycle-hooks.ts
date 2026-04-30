import { useAuthSessionStore } from '../stores/auth-session-store'
import { encryptionKeyStore } from './encryption-key-store'

/**
 * Subscribe to auth session changes: when the user logs out
 * (session becomes null), wipe the encryption key from memory.
 *
 * This ensures PHI in IndexedDB becomes unreadable immediately
 * upon logout — no key means no decryption.
 */
useAuthSessionStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    encryptionKeyStore.wipe()
  }
})

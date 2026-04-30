/**
 * Memory-only encryption key store for the PWA.
 *
 * The AES-256-GCM session key lives exclusively in RAM — never persisted
 * to localStorage, sessionStorage, or IndexedDB.
 *
 * If the key is lost (tab close, logout, refresh), the app must
 * prompt for re-authentication rather than falling back to unencrypted storage.
 */

export class EncryptionKeyNotAvailableError extends Error {
  constructor() {
    super('Encryption key not available — re-authentication required')
    this.name = 'EncryptionKeyNotAvailableError'
  }
}

let sessionKey: CryptoKey | null = null

export const encryptionKeyStore = {
  setKey(key: CryptoKey): void {
    sessionKey = key
  },

  getKey(): CryptoKey | null {
    return sessionKey
  },

  /**
   * Returns the key or throws if unavailable.
   * Use this in code paths that must not proceed without encryption.
   */
  requireKey(): CryptoKey {
    if (!sessionKey) {
      throw new EncryptionKeyNotAvailableError()
    }
    return sessionKey
  },

  isReady(): boolean {
    return sessionKey !== null
  },

  /**
   * Securely wipe the key from memory.
   * Called on tab close, logout, and session expiry.
   */
  wipe(): void {
    sessionKey = null
  },
}

// Wipe key on tab close (CLAUDE.md: "cleared on tab/browser close")
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => encryptionKeyStore.wipe())
}

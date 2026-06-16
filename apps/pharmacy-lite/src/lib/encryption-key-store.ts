/**
 * Memory-only encryption key store for the PWA.
 *
 * The AES-256-GCM session key lives exclusively in RAM — never persisted
 * to localStorage, sessionStorage, or IndexedDB.
 *
 * If the key is lost (tab close, logout, refresh), the app must
 * prompt for re-authentication rather than falling back to unencrypted storage.
 */

const DEVICE_SALT_KEY = 'ultranos:device-salt'

/**
 * Return the 16-byte device salt, creating and persisting it on first use.
 *
 * The salt is stored in localStorage as base64 — it is NOT PHI. It provides
 * device-binding so that a given user's derived key is unique per device.
 */
export function getOrCreateDeviceSalt(): Uint8Array {
  try {
    const stored = localStorage.getItem(DEVICE_SALT_KEY)
    if (stored) {
      const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0))
      if (bytes.length === 16) return bytes
      // Stored value is corrupt — remove it so the new salt persists on next call
      try { localStorage.removeItem(DEVICE_SALT_KEY) } catch { /* noop */ }
    }
  } catch {
    // localStorage unavailable — generate an ephemeral salt for this session
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  try {
    localStorage.setItem(DEVICE_SALT_KEY, btoa(String.fromCharCode(...salt)))
  } catch {
    // localStorage unavailable — encryption key will not survive page refresh
    console.error('[crypto] Device salt could not be persisted — encryption key will not survive page refresh.')
  }
  return salt
}

export class EncryptionKeyNotAvailableError extends Error {
  constructor() {
    super('Encryption key not available — re-authentication required')
    this.name = 'EncryptionKeyNotAvailableError'
  }
}

let sessionKey: CryptoKey | null = null
let keyMap: Record<string, CryptoKey> = {}
let currentWriteVersion = 'v1'

export const encryptionKeyStore = {
  setKey(key: CryptoKey): void {
    sessionKey = key
    keyMap = { [currentWriteVersion]: key }
  },

  getKey(): CryptoKey | null {
    return sessionKey
  },

  /**
   * Returns the key or throws if unavailable.
   * Use this in write paths that must not proceed without encryption.
   */
  requireKey(): CryptoKey {
    if (!sessionKey) {
      throw new EncryptionKeyNotAvailableError()
    }
    return sessionKey
  },

  /**
   * Returns the full key map (version → CryptoKey) for read/decrypt paths.
   * Supports multi-version decryption during and after key rotation.
   * Throws if no keys are available.
   */
  requireKeyMap(): Record<string, CryptoKey> {
    if (Object.keys(keyMap).length === 0) {
      throw new EncryptionKeyNotAvailableError()
    }
    return { ...keyMap }
  },

  /** Returns the version string for the current write key (e.g. 'v1', 'v2'). */
  getCurrentWriteVersion(): string {
    return currentWriteVersion
  },

  /**
   * Add a new key version and promote it to the current write key.
   * The old version remains in the map so encrypted data can still be decrypted
   * during re-encryption and until retireVersion() is called.
   */
  rotateKey(newVersion: string, newKey: CryptoKey): void {
    keyMap[newVersion] = newKey
    sessionKey = newKey
    currentWriteVersion = newVersion
  },

  /**
   * Remove an old key version from the map once all data has been re-encrypted.
   * Cannot retire the current write version.
   */
  retireVersion(version: string): void {
    if (version === currentWriteVersion) {
      throw new Error(`Cannot retire current write version "${version}"`)
    }
    delete keyMap[version]
    if (version === 'v1') {
      sessionKey = keyMap[currentWriteVersion] ?? null
    }
  },

  isReady(): boolean {
    return sessionKey !== null
  },

  /**
   * Securely wipe all keys from memory.
   * Called on tab close, logout, and session expiry.
   */
  wipe(): void {
    sessionKey = null
    keyMap = {}
    currentWriteVersion = 'v1'
  },
}

// Wipe key on tab close (CLAUDE.md: "cleared on tab/browser close")
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => encryptionKeyStore.wipe())
}

/**
 * Memory-only encryption key store for the Lab Lite PWA.
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
   * Story 61.2 / 58.3: install a write key AT a specific version, replacing the
   * current write version. Used by the vNext DEK path to make 'v2' the write
   * version while any legacy 'v1' key remains in the map for decrypt-only.
   *
   * Story 58.3 upgraded lab-lite from a single-key store to a full key map so
   * the Dexie field-encryption middleware (ported from opd-lite/pharmacy-lite)
   * can decrypt multi-version records. Pre-58.3 lab-lite kept no local encrypted
   * PHI store, so a version map was unnecessary; it now does (samples, orders,
   * results, smsQueue, etc. are field-encrypted at rest).
   */
  installWriteKey(version: string, key: CryptoKey): void {
    currentWriteVersion = version
    sessionKey = key
    keyMap[version] = key
  },

  /**
   * Story 61.2: add a decrypt-only key at a version WITHOUT changing the current
   * write key. Keeps a legacy 'v1' key available for reading pre-migration data
   * while new writes use the vNext DEK at 'v2'.
   */
  addDecryptKey(version: string, key: CryptoKey): void {
    keyMap[version] = key
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

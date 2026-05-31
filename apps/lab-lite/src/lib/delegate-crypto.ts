/**
 * delegate-crypto.ts — Story 45.3
 *
 * AES-256-GCM encryption for delegate PII (phone, name) before Dexie storage.
 * Uses the same in-memory session key pattern as consent-crypto.ts.
 * Key lives in memory only — cleared on tab/browser close (CLAUDE.md).
 *
 * Output is base64-encoded: [IV (12 bytes) | ciphertext], so it can be
 * stored as a string in IndexedDB alongside other text fields.
 */

import { getSessionEncryptionKey } from './consent-crypto'

const IV_BYTES = 12

/**
 * Encrypt a plaintext string (phone or name) using AES-256-GCM.
 * Returns base64-encoded [IV | ciphertext].
 * The plaintext MUST NOT be stored or logged.
 */
export async function encryptText(plaintext: string): Promise<string> {
  const key = await getSessionEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_BYTES)
  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt a base64-encoded [IV | ciphertext] string back to plaintext.
 * Used when displaying the delegate's phone or name to the technician.
 * The decrypted value must never be logged.
 */
export async function decryptText(encoded: string): Promise<string> {
  const key = await getSessionEncryptionKey()
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

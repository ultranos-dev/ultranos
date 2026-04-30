import { generateKeyPair } from '@ultranos/sync-engine'

/**
 * RAM-only signing key store for the PWA.
 * The private key lives in memory only — never persisted to localStorage,
 * sessionStorage, or IndexedDB. Cleared on tab close / visibility change.
 *
 * In production, this would be backed by a proper key management ceremony
 * (e.g., clinician generates key pair on first login, public key registered
 * with the Hub). For MVP, we auto-generate per-session.
 */

let cachedPrivateKey: Uint8Array | null = null
let cachedPublicKey: Uint8Array | null = null
let pendingGeneration: Promise<Uint8Array> | null = null

export async function getSigningKey(): Promise<Uint8Array> {
  if (cachedPrivateKey) return cachedPrivateKey
  if (pendingGeneration) return pendingGeneration
  pendingGeneration = generateKeyPair().then((kp) => {
    cachedPrivateKey = kp.privateKey
    cachedPublicKey = kp.publicKey
    pendingGeneration = null
    return cachedPrivateKey
  }).catch((err) => {
    pendingGeneration = null
    throw err
  })
  return pendingGeneration
}

export function getPublicKey(): Uint8Array | null {
  return cachedPublicKey
}

export function clearSigningKeys(): void {
  cachedPrivateKey = null
  cachedPublicKey = null
}

// Clear keys on tab close (CLAUDE.md: "cleared on tab/browser close")
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearSigningKeys)
}

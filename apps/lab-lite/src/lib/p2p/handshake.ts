/**
 * Story 49.3: Secure Channel Handshake
 *
 * ECDH (P-256) key exchange → HKDF → AES-256-GCM session key.
 * First-time pairing: 6-digit visual confirmation code derived from shared secret.
 * Trusted devices: skip re-pairing (ECDH still runs for forward secrecy).
 *
 * Security properties:
 * - Forward secrecy: ephemeral key pairs per session.
 * - Confidentiality: AES-256-GCM for all payload encryption.
 * - Integrity: GCM authentication tag prevents tampering.
 * - Authenticity: Ed25519 signature on bundle (bundle-signer.ts).
 *
 * PHI: zero PHI flows through the handshake. Device names are operational only.
 */

import type { TrustedDevice } from '@ultranos/shared-types'
import { getDb } from '@/lib/db'

// ---------------------------------------------------------------------------
// ECDH key pair generation
// ---------------------------------------------------------------------------

/**
 * Generate an ephemeral ECDH P-256 key pair for this session.
 * Keys are never persisted — generated fresh per connection.
 */
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )
}

/**
 * Export an ECDH public key as a base64 string for transmission.
 */
export async function exportEcdhPublicKey(keyPair: CryptoKeyPair): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
  const bytes = new Uint8Array(raw)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Import a raw P-256 public key from a base64 string.
 */
export async function importEcdhPublicKey(base64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
}

// ---------------------------------------------------------------------------
// Shared secret derivation
// ---------------------------------------------------------------------------

/**
 * Derive the ECDH shared secret bits from our private key and the remote public key.
 * Returns raw 256 bits. Do NOT use directly — derive a session key via HKDF.
 */
export async function deriveSharedSecret(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePublicKey },
    localPrivateKey,
    256,
  )
}

/**
 * Derive an AES-256-GCM session key from the raw ECDH shared secret via HKDF.
 * Salt and info are fixed strings — they don't need to be secret.
 */
export async function deriveSessionKey(sharedSecret: ArrayBuffer): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('ultranos-p2p-v1'),
      info: new TextEncoder().encode('p2p-session-aes-key'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ---------------------------------------------------------------------------
// Pairing code (6 decimal digits — deterministic from shared secret)
// ---------------------------------------------------------------------------

/**
 * Derive a 6-digit visual confirmation code from the shared secret.
 * Both devices compute this independently — if the codes match, the ECDH
 * exchange was not tampered with (basic MITM protection).
 *
 * Algorithm: SHA-256(sharedSecret) → first 4 bytes as big-endian uint32 → mod 1_000_000
 * → zero-padded to 6 digits.
 */
export async function computePairingCode(sharedSecret: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', sharedSecret)
  const bytes = new Uint8Array(hash)
  const num =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return (num % 1_000_000).toString().padStart(6, '0')
}

// ---------------------------------------------------------------------------
// Trusted device management (Dexie v21)
// ---------------------------------------------------------------------------

/** Persist a newly paired device to the trusted device list. */
export async function saveTrustedDevice(device: TrustedDevice): Promise<void> {
  const db = getDb()
  await db.trusted_devices.put(device)
}

/** Check whether a device ID is in the trusted list. */
export async function isTrustedDevice(deviceId: string): Promise<boolean> {
  const db = getDb()
  const record = await db.trusted_devices.get(deviceId)
  return record !== undefined
}

/** Update the lastConnectedAt timestamp for a known trusted device. */
export async function touchTrustedDevice(deviceId: string): Promise<void> {
  const db = getDb()
  await db.trusted_devices.update(deviceId, { lastConnectedAt: new Date().toISOString() })
}

/** Return all trusted devices for display in settings/management UI. */
export async function listTrustedDevices(): Promise<TrustedDevice[]> {
  const db = getDb()
  return db.trusted_devices.toArray()
}

/** Remove a device from the trusted list (manual un-pair). */
export async function removeTrustedDevice(deviceId: string): Promise<void> {
  const db = getDb()
  await db.trusted_devices.delete(deviceId)
}

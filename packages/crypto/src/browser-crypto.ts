const AES_GCM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_BYTES = 12

const VERSION_PREFIX_RE = /^v(\d+):/

/**
 * Thrown when a version prefix in an encrypted payload is not in the supplied key map.
 * The `.version` property carries the unrecognized prefix (e.g. `"v3"`) for opaque logging.
 */
export class UnknownKeyVersionError extends Error {
  readonly version: string
  constructor(version: string) {
    super(`Unknown encryption key version: "${version}"`)
    this.name = 'UnknownKeyVersionError'
    this.version = version
  }
}

/**
 * Derive a deterministic AES-256-GCM key from the JWT `sub` claim and a device salt.
 *
 * Uses PBKDF2-SHA256 with 100,000 iterations (OWASP 2023 minimum) so that
 * brute-force against a leaked `sub` is computationally expensive.
 *
 * The derived key is non-extractable by default — it cannot be exported via JS.
 * Pass `extractable: true` only in unit tests that need to verify key bytes.
 *
 * Same (sub, salt) pair always produces the same key on the same device,
 * so encrypted IndexedDB data survives a page refresh as long as the
 * Supabase session is still valid and the device salt is in localStorage.
 */
export async function deriveSessionKey(
  sub: string,
  salt: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sub),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: AES_GCM, length: KEY_LENGTH },
    extractable,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Derive a version-specific AES-256-GCM key for key rotation.
 * Version string is appended to the device salt before PBKDF2:
 *   v1 key: PBKDF2(sub, deviceSalt)         — same as deriveSessionKey (v1 = no suffix)
 *   v2 key: PBKDF2(sub, deviceSalt + "v2")  — rotated
 *
 * The v1 salt modifier is empty string so `deriveKeyForVersion(sub, salt, 'v1')`
 * produces the same key as `deriveSessionKey(sub, salt)`.
 */
export async function deriveKeyForVersion(
  sub: string,
  deviceSalt: Uint8Array,
  version: string,
  extractable = false,
): Promise<CryptoKey> {
  const modifier = version === 'v1' ? '' : version
  let salt: Uint8Array
  if (modifier.length === 0) {
    salt = deviceSalt
  } else {
    const modifierBytes = new TextEncoder().encode(modifier)
    salt = new Uint8Array(deviceSalt.length + modifierBytes.length)
    salt.set(deviceSalt, 0)
    salt.set(modifierBytes, deviceSalt.length)
  }
  return deriveSessionKey(sub, salt, extractable)
}

/**
 * Generate a new AES-256-GCM session key using the Web Crypto API.
 * The key is extractable so it can be exported/imported for key lifecycle management.
 */
export async function generateSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_GCM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypt a JSON-serializable value using AES-256-GCM.
 * Returns a version-prefixed string: `v<N>:<base64(IV + ciphertext)>`.
 *
 * The version defaults to `'v1'`. After key rotation, callers should pass
 * the current write version (e.g. `'v2'`) alongside the corresponding key.
 */
export async function encryptPayload(
  key: CryptoKey,
  data: unknown,
  version = 'v1',
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: AES_GCM, iv },
    key,
    plaintext,
  )

  // Combine IV + ciphertext into a single buffer, then base64-encode
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_BYTES)

  return `${version}:${uint8ToBase64(combined)}`
}

/**
 * Decrypt a version-prefixed payload back to the original value.
 *
 * Accepts either a single `CryptoKey` (treated as `{ v1: key }` for backward
 * compatibility) or a `Record<string, CryptoKey>` key map for multi-version
 * decryption during and after key rotation.
 *
 * Legacy unversioned payloads (no `v<N>:` prefix) are treated as implicit v1.
 * Throws `UnknownKeyVersionError` for version strings not in the key map.
 */
export async function decryptPayload(
  keyOrMap: CryptoKey | Record<string, CryptoKey>,
  encoded: string,
): Promise<unknown> {
  // Normalise to a key map
  const keyMap: Record<string, CryptoKey> =
    keyOrMap instanceof CryptoKey
      ? { v1: keyOrMap }
      : (keyOrMap as Record<string, CryptoKey>)

  // Parse version prefix; fall back to implicit v1 for legacy unversioned payloads
  const match = VERSION_PREFIX_RE.exec(encoded)
  let version: string
  let base64Part: string
  if (match) {
    version = `v${match[1]}`
    base64Part = encoded.slice(match[0].length)
  } else {
    version = 'v1'
    base64Part = encoded
  }

  const key = keyMap[version]
  if (!key) {
    console.error(`[crypto] Unknown key version "${version}" — cannot decrypt record`)
    throw new UnknownKeyVersionError(version)
  }

  const combined = base64ToUint8(base64Part)
  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_GCM, iv },
    key,
    ciphertext,
  )

  return JSON.parse(new TextDecoder().decode(plaintext))
}

/**
 * Export a CryptoKey to a base64-encoded raw key string.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return uint8ToBase64(new Uint8Array(raw))
}

/**
 * Import a base64-encoded raw key string back to a CryptoKey.
 */
export async function importKey(encoded: string): Promise<CryptoKey> {
  const raw = base64ToUint8(encoded)
  return crypto.subtle.importKey(
    'raw',
    raw.buffer as ArrayBuffer,
    { name: AES_GCM, length: KEY_LENGTH },
    true,
    ['encrypt', 'decrypt'],
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Story 61.2 — KDF vNext: dual-wrapped Data Encryption Key (DEK)
//
// Threat addressed (P-CRYPTO-2 / H-OPD-2): the legacy scheme derived the session
// key from PBKDF2(supabase `sub`, localStorage device salt). BOTH inputs are
// recoverable from the workstation's disk, so an attacker with disk access could
// re-derive the at-rest key — "encryption at rest" was only nominal.
//
// vNext: a random 256-bit DEK is the real at-rest key. It is NEVER derivable from
// on-disk artifacts. Instead it is WRAPPED twice (dual-wrap, Decision #6b) and only
// the two wrapped blobs are persisted:
//   (a) under a wrapping key derived (HKDF) from a per-user, session-bound secret
//       the HUB issues at login and that lives ONLY in memory (never persisted), and
//   (b) under a wrapping key derived (PBKDF2) from a device PIN the user knows.
// Either arm can unwrap the DEK:
//   - Normal / online: unwrap with the hub server-secret arm.
//   - Offline cold-start (multi-day outage, no hub reachable): unwrap with the PIN arm.
// Because neither wrapping key's material sits on disk (server secret = memory-only;
// PIN = user knowledge), the persisted wrapped-DEK bundle is inert to a disk-only
// attacker. The device salt stays on disk purely as a per-device KDF salt — it is
// no longer sufficient (alone or with `sub`) to derive the key.
//
// AES-KW is used for wrapping: deterministic, no IV to manage, and it fails closed
// (integrity-checked) on a wrong wrapping key. The unwrapped DEK is imported
// non-extractable for use so it cannot be exported back out via JS.
// ─────────────────────────────────────────────────────────────────────────────

/** Scheme tag for the dual-wrapped DEK format (distinct from payload versions v1/v2). */
export const KEY_SCHEME_VERSION = 'k2' as const

const AES_KW = 'AES-KW'
const HKDF = 'HKDF'
const PBKDF2 = 'PBKDF2'
/** OWASP 2023 PBKDF2-SHA256 guidance is 600k; the PIN arm uses a strong count. */
const PIN_PBKDF2_ITERATIONS = 210_000

/** Persisted, on-disk-safe representation of a DEK wrapped under both arms. */
export interface WrappedDekBundle {
  /** Scheme tag — always {@link KEY_SCHEME_VERSION}. */
  scheme: typeof KEY_SCHEME_VERSION
  /** base64(AES-KW( DEK )) using the hub-server-secret-derived wrapping key. */
  serverWrapped: string
  /** base64(AES-KW( DEK )) using the PIN-derived wrapping key. */
  pinWrapped: string
  /** base64 of the per-device salt used by BOTH wrapping-key KDFs. */
  salt: string
}

/** Thrown when a DEK cannot be unwrapped (wrong secret/PIN, or tampered blob). */
export class DekUnwrapError extends Error {
  constructor(message = 'Failed to unwrap Data Encryption Key') {
    super(message)
    this.name = 'DekUnwrapError'
  }
}

/**
 * Generate a fresh random 256-bit AES-GCM Data Encryption Key.
 * Extractable so it can be wrapped (AES-KW requires an extractable key to wrap).
 * Callers that only need to USE the key for encrypt/decrypt should prefer the
 * non-extractable key returned by {@link unwrapDek}.
 */
export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: AES_GCM, length: KEY_LENGTH },
    true, // extractable — required to wrap it
    ['encrypt', 'decrypt'],
  )
}

/**
 * Derive an AES-KW wrapping key from the HUB-issued, session-bound server secret,
 * mixed with the user `sub` (HKDF info) and the per-device salt.
 *
 * The server secret is the genuine secret this whole scheme hinges on: it is
 * issued by the hub at authentication and held in memory ONLY. Without it, the
 * server-arm wrapping key cannot be reconstructed from disk.
 */
export async function deriveWrappingKeyFromServerSecret(
  serverSecret: string,
  sub: string,
  salt: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serverSecret),
    { name: HKDF },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: HKDF,
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode(`ultranos:dek-wrap:server:${sub}`),
    },
    material,
    { name: AES_KW, length: KEY_LENGTH },
    extractable,
    ['wrapKey', 'unwrapKey'],
  )
}

/**
 * Derive an AES-KW wrapping key from a device PIN via PBKDF2-SHA256.
 * This is the offline cold-start arm: on a multi-day outage the user can unwrap
 * the DEK with the PIN they know, with no hub round-trip.
 */
export async function deriveWrappingKeyFromPin(
  pin: string,
  salt: Uint8Array,
  extractable = false,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    { name: PBKDF2 },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: PBKDF2,
      salt: salt as BufferSource,
      iterations: PIN_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: AES_KW, length: KEY_LENGTH },
    extractable,
    ['wrapKey', 'unwrapKey'],
  )
}

/** Wrap an (extractable) DEK under a wrapping key, returning base64(AES-KW output). */
export async function wrapDek(dek: CryptoKey, wrappingKey: CryptoKey): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', dek, wrappingKey, { name: AES_KW })
  return uint8ToBase64(new Uint8Array(wrapped))
}

/**
 * Unwrap a base64(AES-KW) blob back into a usable, NON-extractable AES-GCM DEK.
 * Throws {@link DekUnwrapError} on a wrong wrapping key or tampered blob
 * (AES-KW is integrity-checked and fails closed).
 */
export async function unwrapDek(wrappedBase64: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  try {
    const wrapped = base64ToUint8(wrappedBase64)
    return await crypto.subtle.unwrapKey(
      'raw',
      wrapped as BufferSource,
      wrappingKey,
      { name: AES_KW },
      { name: AES_GCM, length: KEY_LENGTH },
      false, // non-extractable — usable for encrypt/decrypt, not exportable
      ['encrypt', 'decrypt'],
    )
  } catch {
    throw new DekUnwrapError()
  }
}

/**
 * Dual-wrap a fresh (or supplied) DEK under BOTH the hub-server-secret arm and the
 * PIN arm, producing the on-disk-safe {@link WrappedDekBundle}.
 *
 * The returned `dek` is the same (extractable) key that was wrapped; callers
 * typically discard it and re-open the store via {@link unwrapDekWithServerSecret}
 * / {@link unwrapDekWithPin} to obtain a non-extractable working key.
 */
export async function dualWrapDek(params: {
  serverSecret: string
  sub: string
  pin: string
  salt: Uint8Array
  /** Optional existing DEK to wrap (e.g. during migration); generated if omitted. */
  dek?: CryptoKey
}): Promise<{ bundle: WrappedDekBundle; dek: CryptoKey }> {
  const dek = params.dek ?? (await generateDek())
  const serverKey = await deriveWrappingKeyFromServerSecret(params.serverSecret, params.sub, params.salt)
  const pinKey = await deriveWrappingKeyFromPin(params.pin, params.salt)
  const [serverWrapped, pinWrapped] = await Promise.all([
    wrapDek(dek, serverKey),
    wrapDek(dek, pinKey),
  ])
  return {
    dek,
    bundle: {
      scheme: KEY_SCHEME_VERSION,
      serverWrapped,
      pinWrapped,
      salt: uint8ToBase64(params.salt),
    },
  }
}

/**
 * Unwrap the DEK from a bundle using the hub-issued server secret (online path).
 * Returns a non-extractable working key. Throws {@link DekUnwrapError} on failure.
 */
export async function unwrapDekWithServerSecret(
  bundle: WrappedDekBundle,
  serverSecret: string,
  sub: string,
): Promise<CryptoKey> {
  const salt = base64ToUint8(bundle.salt)
  const serverKey = await deriveWrappingKeyFromServerSecret(serverSecret, sub, salt)
  return unwrapDek(bundle.serverWrapped, serverKey)
}

/**
 * Unwrap the DEK from a bundle using the device PIN (offline cold-start path).
 * Returns a non-extractable working key. Throws {@link DekUnwrapError} on a wrong PIN.
 */
export async function unwrapDekWithPin(
  bundle: WrappedDekBundle,
  pin: string,
): Promise<CryptoKey> {
  const salt = base64ToUint8(bundle.salt)
  const pinKey = await deriveWrappingKeyFromPin(pin, salt)
  return unwrapDek(bundle.pinWrapped, pinKey)
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

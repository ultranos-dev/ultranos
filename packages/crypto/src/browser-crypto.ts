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

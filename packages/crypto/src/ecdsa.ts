/**
 * ECDSA-P256 cryptographic functions for Identity QR code signing.
 * Story 25.4: Platform-agnostic — uses Web Crypto API (crypto.subtle).
 *
 * IMPORTANT: ECDSA-P256 is for patient identity QR ONLY.
 * Prescription QR signing uses Ed25519 (separate system).
 */

const ECDSA_ALGO = { name: 'ECDSA', namedCurve: 'P-256' } as const
const SIGN_ALGO = { name: 'ECDSA', hash: 'SHA-256' } as const

export interface EcdsaKeyPair {
  /** Base64-encoded SPKI public key */
  publicKey: string
  /** Base64-encoded PKCS8 private key */
  privateKey: string
}

/**
 * Generate an ECDSA P-256 key pair.
 * Returns base64-encoded SPKI (public) and PKCS8 (private) keys.
 */
export async function generateEcdsaKeyPair(): Promise<EcdsaKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    ECDSA_ALGO,
    true,
    ['sign', 'verify'],
  )

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)

  return {
    publicKey: uint8ToBase64(new Uint8Array(publicKeyBuffer)),
    privateKey: uint8ToBase64(new Uint8Array(privateKeyBuffer)),
  }
}

/**
 * Sign a string payload with an ECDSA-P256 private key.
 * Returns a compact base64 signature (raw r||s, 64 bytes).
 */
export async function signWithEcdsa(privateKeyBase64: string, payload: string): Promise<string> {
  const privateKeyBuffer = base64ToUint8(privateKeyBase64)
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer.buffer as ArrayBuffer,
    ECDSA_ALGO,
    false,
    ['sign'],
  )

  const data = new TextEncoder().encode(payload)
  const signature = await crypto.subtle.sign(SIGN_ALGO, key, data)

  return uint8ToBase64(new Uint8Array(signature))
}

/**
 * Verify an ECDSA-P256 signature against a payload and public key.
 * Returns true if valid, false otherwise (never throws on invalid signature).
 */
export async function verifyEcdsaSignature(
  publicKeyBase64: string,
  payload: string,
  signatureBase64: string,
): Promise<boolean> {
  try {
    const publicKeyBuffer = base64ToUint8(publicKeyBase64)
    const key = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer.buffer as ArrayBuffer,
      ECDSA_ALGO,
      false,
      ['verify'],
    )

    const data = new TextEncoder().encode(payload)
    const signature = base64ToUint8(signatureBase64)

    return await crypto.subtle.verify(SIGN_ALGO, key, signature as BufferSource, data as BufferSource)
  } catch {
    return false
  }
}

/**
 * Serialize an object to canonical JSON: keys sorted lexicographically at every
 * level, so the byte string is independent of insertion order. This is the
 * signing/verification contract for identity QR payloads (Story 61.2 /
 * P-CRYPTO-17) — `JSON.stringify` alone is key-order sensitive, so a scanner
 * that reconstructs `{ pid, iat, exp, v }` in a different order than the signer
 * used would previously fail verification. Canonical JSON removes that brittleness.
 *
 * Only plain JSON values are expected in identity QR payloads (strings, numbers,
 * booleans, null, and nested objects/arrays of those). Arrays keep their order.
 */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value))
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep)
  }
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = sortDeep(obj[key])
    }
    return sorted
  }
  return value
}

/**
 * Options for {@link verifyIdentityQrPayload}.
 */
export interface VerifyIdentityQrOptions {
  /**
   * Current time in ms since epoch for `exp` enforcement. Defaults to `Date.now()`.
   * Injectable so tests can pin the clock.
   */
  now?: number
  /**
   * When true (default), a payload whose `exp` is in the past is rejected even
   * if the signature is valid. Set false only for tooling that must inspect
   * expired passports; production scanners MUST leave this true.
   */
  enforceExpiry?: boolean
}

/**
 * Verify an Identity QR payload (Health Passport).
 *
 * Strips the `sig` field, re-serializes the remaining payload with
 * {@link canonicalJsonStringify} (sorted keys — order-independent), verifies the
 * ECDSA-P256 signature, AND enforces the `exp` expiry claim (Story 61.2 /
 * P-CRYPTO-3). Returns true only when the signature is valid AND the passport is
 * not expired.
 *
 * `exp` and `iat` are accepted as either an ISO-8601 instant string or a
 * numeric epoch (seconds or milliseconds). A payload with no `exp` is treated as
 * non-expiring for signature purposes (expiry cannot be enforced on a claim that
 * isn't present) — issuers SHOULD always include `exp`.
 *
 * Returns false if: no `sig`, invalid signature, malformed JSON, or (when
 * `enforceExpiry`) the passport is expired.
 */
export async function verifyIdentityQrPayload(
  publicKeyBase64: string,
  qrJsonString: string,
  options: VerifyIdentityQrOptions = {},
): Promise<boolean> {
  const { now = Date.now(), enforceExpiry = true } = options
  try {
    const parsed = JSON.parse(qrJsonString)
    if (!parsed || typeof parsed !== 'object') return false
    if (!parsed.sig || typeof parsed.sig !== 'string') {
      return false
    }
    const sig = parsed.sig as string
    const { sig: _removed, ...basePayload } = parsed as Record<string, unknown>

    // Canonical (sorted-key) serialization — order-independent verification.
    const basePayloadString = canonicalJsonStringify(basePayload)
    const signatureValid = await verifyEcdsaSignature(publicKeyBase64, basePayloadString, sig)
    if (!signatureValid) return false

    // Expiry enforcement — a validly-signed but expired passport is rejected.
    if (enforceExpiry && 'exp' in basePayload) {
      const expMs = toEpochMs(basePayload.exp)
      if (expMs !== null && now > expMs) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * Normalise an `exp`/`iat` claim to epoch milliseconds.
 * Accepts an ISO-8601 string, epoch seconds (< 1e12), or epoch milliseconds.
 * Returns null for an unparseable value (expiry then cannot be enforced).
 */
function toEpochMs(claim: unknown): number | null {
  if (typeof claim === 'number' && Number.isFinite(claim)) {
    // Heuristic: values below 1e12 are seconds-since-epoch, otherwise ms.
    return claim < 1e12 ? claim * 1000 : claim
  }
  if (typeof claim === 'string') {
    const parsed = Date.parse(claim)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
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

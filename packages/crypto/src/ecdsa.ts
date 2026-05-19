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
 * Verify an Identity QR payload (Health Passport).
 * Extracts and strips the `sig` field, then verifies the remaining payload.
 * This enforces the canonical signing contract: sign JSON.stringify({ pid, iat, exp, v }),
 * embed sig in the QR as { pid, iat, exp, v, sig }.
 *
 * Returns true if signature is valid, false otherwise.
 * Returns false if no `sig` field is present.
 */
export async function verifyIdentityQrPayload(
  publicKeyBase64: string,
  qrJsonString: string,
): Promise<boolean> {
  try {
    const parsed = JSON.parse(qrJsonString)
    if (!parsed.sig || typeof parsed.sig !== 'string') {
      return false
    }
    const sig = parsed.sig
    const { sig: _removed, ...basePayload } = parsed
    const basePayloadString = JSON.stringify(basePayload)
    return await verifyEcdsaSignature(publicKeyBase64, basePayloadString, sig)
  } catch {
    return false
  }
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

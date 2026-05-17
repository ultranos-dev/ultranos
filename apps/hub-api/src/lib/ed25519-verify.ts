import crypto from 'crypto'

/**
 * Verify an Ed25519 signature against a base64-encoded public key.
 *
 * Used for server-side QR prescription verification (Story 21.2).
 * Separate from ECDSA-P256 in packages/crypto (that's for Health Passport QR).
 *
 * @param payload  - The original signed string (JSON-stringified prescription data)
 * @param signature - Base64-encoded Ed25519 signature
 * @param publicKey - Base64-encoded DER/SPKI public key
 * @returns true if the signature is valid, false otherwise
 */
export function verifyEd25519Signature(
  payload: string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    const keyObject = crypto.createPublicKey({
      key: Buffer.from(publicKey, 'base64'),
      format: 'der',
      type: 'spki',
    })
    const sigBuffer = Buffer.from(signature, 'base64')
    return crypto.verify(null, Buffer.from(payload), keyObject, sigBuffer)
  } catch {
    return false
  }
}

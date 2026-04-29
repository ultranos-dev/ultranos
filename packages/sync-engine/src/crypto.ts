import * as ed from '@noble/ed25519'

export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

const encoder = new TextEncoder()

/**
 * Generate an Ed25519 key pair for prescription signing.
 * The private key MUST be stored in device secure storage (never persisted to disk/localStorage).
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const privateKey = ed.utils.randomSecretKey()
  const publicKey = await ed.getPublicKeyAsync(privateKey)
  return { publicKey, privateKey }
}

/**
 * Sign a UTF-8 payload with an Ed25519 private key.
 * Returns a 64-byte signature.
 */
export async function signPayload(
  payload: string,
  privateKey: Uint8Array,
): Promise<Uint8Array> {
  const message = encoder.encode(payload)
  return ed.signAsync(message, privateKey)
}

/**
 * Verify an Ed25519 signature against a payload and public key.
 * Used by the Pharmacy app to authenticate prescriptions.
 */
export async function verifySignature(
  payload: string,
  signature: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  const message = encoder.encode(payload)
  return ed.verifyAsync(signature, message, publicKey)
}

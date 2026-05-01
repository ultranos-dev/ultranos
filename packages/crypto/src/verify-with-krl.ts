/**
 * KRL-aware signature verification wrapper.
 * Story 7.4: Provides a standard integration point for KRL checks
 * before Ed25519 signature verification across all consumer apps.
 *
 * This module does NOT depend on any specific storage layer — consumers
 * inject a KRL checker function appropriate to their platform.
 */

export type KrlCheckResult =
  | { status: 'clean' }
  | { status: 'revoked' }
  | { status: 'unavailable'; reason: string }

/**
 * A function that checks whether a public key is in the local KRL.
 * Returns 'clean' if not revoked, 'revoked' if found, or 'unavailable'
 * if the KRL cannot be checked (e.g., DB error).
 */
export type KrlChecker = (publicKeyBase64: string) => Promise<KrlCheckResult>

export interface VerifyWithKrlOptions {
  /** The public key to verify against (base64-encoded Ed25519) */
  publicKey: string
  /** The KRL checker function (platform-specific) */
  checkKrl: KrlChecker
  /** The actual signature verification function to call if KRL passes */
  verify: () => Promise<boolean>
}

export type VerifyWithKrlResult =
  | { valid: true }
  | { valid: false; reason: 'key_revoked' | 'invalid_signature' | 'krl_unavailable' }

/**
 * Verify a signature with KRL pre-check (fail-closed).
 *
 * 1. Check local KRL — reject immediately if key is revoked.
 * 2. If KRL is unavailable, return untrusted (fail-closed).
 * 3. Only if KRL passes, proceed to cryptographic signature verification.
 */
export async function verifyWithKrl(opts: VerifyWithKrlOptions): Promise<VerifyWithKrlResult> {
  const krlResult = await opts.checkKrl(opts.publicKey)

  if (krlResult.status === 'revoked') {
    return { valid: false, reason: 'key_revoked' }
  }

  if (krlResult.status === 'unavailable') {
    return { valid: false, reason: 'krl_unavailable' }
  }

  const isValid = await opts.verify()
  if (!isValid) {
    return { valid: false, reason: 'invalid_signature' }
  }

  return { valid: true }
}

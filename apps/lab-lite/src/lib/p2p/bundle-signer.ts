/**
 * Story 49.3: FHIR DiagnosticReport Bundle Signing & Verification
 *
 * Signs FHIR DiagnosticReport resources with the technician's Ed25519 private key
 * and verifies signatures against cached practitioner public keys (Story 7.4).
 *
 * Canonical JSON: keys sorted lexicographically, no whitespace.
 * This ensures the signature is reproducible regardless of object property order.
 *
 * PHI: the bundle contains PHI (the DiagnosticReport itself). It is encrypted
 * in transit by transfer-protocol.ts via AES-256-GCM. The signer never logs
 * the bundle content — only the signerPractitionerId and signedAt timestamp.
 */

import nacl from 'tweetnacl'
import type { SignedBundle } from '@ultranos/shared-types'
import { getDb } from '@/lib/db'

// ---------------------------------------------------------------------------
// Canonical JSON (deterministic serialization)
// ---------------------------------------------------------------------------

/**
 * Produce a canonical (sorted-key, no-whitespace) JSON string.
 * Ensures Ed25519 signatures are reproducible across environments.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return '[' + (obj as unknown[]).map(canonicalJson).join(',') + ']'
  }
  const record = obj as Record<string, unknown>
  const sorted = Object.keys(record).sort().filter((k) => record[k] !== undefined)
  const pairs = sorted.map(
    (k) => JSON.stringify(k) + ':' + canonicalJson(record[k]),
  )
  return '{' + pairs.join(',') + '}'
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Sign a FHIR DiagnosticReport with the technician's Ed25519 private key.
 *
 * @param report        Any FHIR resource (typically FhirDiagnosticReport)
 * @param privateKey    32-byte Ed25519 seed (from practitioner key infrastructure)
 * @param practitionerId  Opaque practitioner ID string — logged in audit, never PHI
 */
export function signDiagnosticReportBundle(
  report: unknown,
  privateKey: Uint8Array,
  practitionerId: string,
): SignedBundle {
  const bundle = canonicalJson(report)
  const messageBytes = new TextEncoder().encode(bundle)

  if (privateKey.length !== 32 && privateKey.length !== 64) {
    throw new Error(`Invalid Ed25519 key length: expected 32 (seed) or 64 (secret key), got ${privateKey.length}`)
  }

  // nacl.sign.keyPair.fromSeed expects a 32-byte seed and produces a 64-byte secret key
  const keyPair =
    privateKey.length === 32
      ? nacl.sign.keyPair.fromSeed(privateKey)
      : { secretKey: privateKey }

  const signatureBytes = nacl.sign.detached(messageBytes, keyPair.secretKey)

  // Loop-based base64 encoding (safe for any buffer size)
  let sigBinary = ''
  for (let i = 0; i < signatureBytes.length; i++) {
    sigBinary += String.fromCharCode(signatureBytes[i])
  }

  return {
    bundle,
    signature: btoa(sigBinary),
    signerPractitionerId: practitionerId,
    signedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify the Ed25519 signature on a signed bundle.
 *
 * @param signedBundle  The bundle returned by signDiagnosticReportBundle
 * @param publicKey     32-byte Ed25519 public key
 */
export function verifyDiagnosticReportBundle(
  signedBundle: SignedBundle,
  publicKey: Uint8Array,
): { valid: boolean; practitionerId: string; signedAt: string } {
  try {
    const messageBytes = new TextEncoder().encode(signedBundle.bundle)
    const signatureBytes = Uint8Array.from(atob(signedBundle.signature), (c) =>
      c.charCodeAt(0),
    )
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey)
    return {
      valid,
      practitionerId: signedBundle.signerPractitionerId,
      signedAt: signedBundle.signedAt,
    }
  } catch {
    return {
      valid: false,
      practitionerId: signedBundle.signerPractitionerId,
      signedAt: signedBundle.signedAt,
    }
  }
}

// ---------------------------------------------------------------------------
// Key retrieval from Dexie (practitioner_keys table — Story 7.4)
// ---------------------------------------------------------------------------

/**
 * Retrieve a cached practitioner's Ed25519 public key from Dexie.
 * Returns null if the practitioner is not in the local cache.
 */
export async function getCachedPublicKey(
  practitionerId: string,
): Promise<Uint8Array | null> {
  const db = getDb()
  const record = await db.practitioner_keys.get(practitionerId)
  if (!record) return null
  return Uint8Array.from(atob(record.publicKey), (c) => c.charCodeAt(0))
}

/**
 * Verify a signed bundle against cached practitioner keys.
 * Tries the claimed signerPractitionerId first (O(1)), then falls back
 * to exhaustive search. Returns the ACTUAL signer's practitioner ID.
 *
 * Used by the OPD-Lite receiver side to authenticate incoming results.
 */
export async function verifyBundleWithCachedKeys(
  signedBundle: SignedBundle,
): Promise<{ valid: boolean; practitionerId: string | null }> {
  const db = getDb()

  // Fast path: look up by the claimed signer ID
  const claimedKey = await db.practitioner_keys.get(signedBundle.signerPractitionerId)
  if (claimedKey) {
    const publicKey = Uint8Array.from(atob(claimedKey.publicKey), (c) => c.charCodeAt(0))
    const result = verifyDiagnosticReportBundle(signedBundle, publicKey)
    if (result.valid) {
      return { valid: true, practitionerId: claimedKey.practitionerId }
    }
  }

  // Fallback: try all cached keys (handles key rotation / ID mismatch)
  const keys = await db.practitioner_keys.toArray()
  for (const key of keys) {
    if (key.practitionerId === signedBundle.signerPractitionerId) continue // already tried
    const publicKey = Uint8Array.from(atob(key.publicKey), (c) => c.charCodeAt(0))
    const result = verifyDiagnosticReportBundle(signedBundle, publicKey)
    if (result.valid) {
      return { valid: true, practitionerId: key.practitionerId }
    }
  }
  return { valid: false, practitionerId: null }
}

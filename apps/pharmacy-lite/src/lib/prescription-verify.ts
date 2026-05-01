import { verifySignature } from '@ultranos/sync-engine'
import type { SignedPrescriptionBundle } from './prescription-types'
import { db } from './db'

export interface VerifiedPrescription {
  id: string
  med: string
  medN: string
  medT: string
  dos: {
    qty: number
    unit: string
    freq?: string
    freqN?: number
    per?: number
    perU?: string
    prn?: true
  }
  dur: number
  enc?: string
  req: string
  pat: string
  at: string
}

export type VerificationResult =
  | { status: 'verified'; prescriptions: VerifiedPrescription[]; practitionerName?: string }
  | { status: 'invalid_signature' }
  | { status: 'key_revoked' }
  | { status: 'expired'; expiry: string }
  | { status: 'unknown_clinician'; fallbackAvailable: boolean }
  | { status: 'untrusted'; reason: string }
  | { status: 'parse_error'; message: string }

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Verify a scanned QR prescription bundle entirely offline.
 *
 * 1. Parse the SignedPrescriptionBundle from the QR string
 * 2. Check expiry
 * 3. Verify Ed25519 signature against the embedded public key
 * 4. Look up the public key in the local practitioners cache
 * 5. Return verified prescriptions or an error state
 */
export async function verifyPrescriptionQr(qrData: string): Promise<VerificationResult> {
  let bundle: SignedPrescriptionBundle
  try {
    bundle = JSON.parse(qrData)
  } catch {
    return { status: 'parse_error', message: 'Invalid QR code format' }
  }

  if (!bundle.payload || !bundle.sig || !bundle.pub || !bundle.expiry || !bundle.issued_at) {
    return { status: 'parse_error', message: 'Incomplete prescription bundle' }
  }

  // Check expiry
  const expiryDate = new Date(bundle.expiry)
  if (Number.isNaN(expiryDate.getTime())) {
    return { status: 'parse_error', message: 'Invalid expiry date' }
  }
  if (expiryDate.getTime() < Date.now()) {
    return { status: 'expired', expiry: bundle.expiry }
  }

  // Story 7.4 AC 4: Check local KRL BEFORE any signature verification.
  // Immediately reject signatures from keys present in the local KRL.
  // Fail-closed: if KRL check fails, treat as untrusted (Developer Guardrail).
  try {
    const revoked = await db.revokedKeys.get(bundle.pub)
    if (revoked) {
      // AC 5: Log attempt to use a revoked key
      await logRevokedKeyAttempt(bundle.pub, revoked.revokedAt)
      return { status: 'key_revoked' }
    }
  } catch {
    // Fail-closed: KRL check failure means we cannot verify key status
    return { status: 'untrusted', reason: 'Key revocation list unavailable' }
  }

  // Look up the clinician's public key in the trusted local cache FIRST
  const practitioner = await lookupPractitionerByPublicKey(bundle.pub)
  if (!practitioner) {
    return { status: 'unknown_clinician', fallbackAvailable: typeof navigator !== 'undefined' && navigator.onLine }
  }

  // Decode and verify Ed25519 signature against the TRUSTED cached key
  let signature: Uint8Array
  let publicKey: Uint8Array
  try {
    signature = base64ToUint8(bundle.sig)
    publicKey = base64ToUint8(practitioner.publicKeyRaw)
  } catch {
    return { status: 'parse_error', message: 'Invalid base64 in signature or public key' }
  }

  let isValid: boolean
  try {
    isValid = await verifySignature(bundle.payload, signature, publicKey)
  } catch {
    return { status: 'invalid_signature' }
  }

  if (!isValid) {
    return { status: 'invalid_signature' }
  }

  // Parse the verified payload
  let prescriptions: VerifiedPrescription[]
  try {
    prescriptions = JSON.parse(bundle.payload)
  } catch {
    return { status: 'parse_error', message: 'Invalid prescription payload' }
  }

  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    return { status: 'parse_error', message: 'Prescription payload is empty or not an array' }
  }

  // Validate minimum required fields on each prescription
  for (const rx of prescriptions) {
    if (!rx.id || !rx.medN || !rx.dos || typeof rx.dos.qty !== 'number' || !rx.dos.unit) {
      return { status: 'parse_error', message: 'Prescription entry missing required fields' }
    }
  }

  return {
    status: 'verified',
    prescriptions,
    practitionerName: practitioner.name,
  }
}

/** Maximum cache age for practitioner keys: 24 hours */
const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000

async function lookupPractitionerByPublicKey(
  pubKeyBase64: string,
): Promise<{ id: string; name: string; publicKeyRaw: string } | null> {
  try {
    const entry = await db.practitionerKeys.get(pubKeyBase64)
    if (entry) {
      // Check TTL — reject stale cached keys (revoked keys must not persist)
      const cachedAge = Date.now() - new Date(entry.cachedAt).getTime()
      if (cachedAge > KEY_CACHE_TTL_MS) {
        await db.practitionerKeys.delete(pubKeyBase64)
        // AC 5: Log attempt to use an expired (stale) cached key
        await logExpiredKeyAttempt(pubKeyBase64)
        return null
      }
      return { id: entry.practitionerId, name: entry.practitionerName, publicKeyRaw: entry.publicKey }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Fetch and cache a practitioner's public key from the Hub.
 * Used as fallback when the local cache doesn't have the key.
 */
export async function fetchAndCachePractitionerKey(
  pubKeyBase64: string,
  hubBaseUrl: string,
  authToken: string,
  signal?: AbortSignal,
): Promise<{ id: string; name: string } | null> {
  const res = await fetch(
    `${hubBaseUrl}/api/practitioners/by-public-key/${encodeURIComponent(pubKeyBase64)}`,
    {
      headers: { Authorization: `Bearer ${authToken}` },
      signal,
    },
  )

  if (!res.ok) return null

  const data = (await res.json()) as Record<string, unknown>

  if (
    typeof data.practitionerId !== 'string' || !data.practitionerId ||
    typeof data.practitionerName !== 'string' || !data.practitionerName ||
    typeof data.publicKey !== 'string' || !data.publicKey
  ) {
    return null
  }

  // Cache locally for future offline use
  await db.practitionerKeys.put({
    publicKey: data.publicKey as string,
    practitionerId: data.practitionerId as string,
    practitionerName: data.practitionerName as string,
    cachedAt: new Date().toISOString(),
  })

  return { id: data.practitionerId as string, name: data.practitionerName as string }
}

/**
 * Story 7.4 AC 5: Log attempts to use an expired or revoked key.
 * Queues an audit event for sync to Hub API. Contains only opaque identifiers — no PHI.
 */
async function logRevokedKeyAttempt(publicKey: string, revokedAt: string): Promise<void> {
  try {
    await db.pendingAuditEvents.add({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorRole: 'SYSTEM',
      action: 'REVOKED_KEY_USAGE_ATTEMPT',
      resourceType: 'PractitionerKey',
      outcome: 'DENIED',
      denialReason: `Key revoked at ${revokedAt}`,
      metadata: { publicKeyPrefix: publicKey.slice(0, 8) },
      _syncStatus: 'pending',
    })
  } catch {
    // Best-effort logging — don't block verification flow
  }
}

/**
 * Story 7.4 AC 5: Log attempts to use an expired (stale cache) key.
 * Queues an audit event for sync to Hub API. Contains only opaque identifiers — no PHI.
 */
async function logExpiredKeyAttempt(publicKey: string): Promise<void> {
  try {
    await db.pendingAuditEvents.add({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorRole: 'SYSTEM',
      action: 'EXPIRED_KEY_USAGE_ATTEMPT',
      resourceType: 'PractitionerKey',
      outcome: 'DENIED',
      denialReason: 'Cached key TTL expired (24h)',
      metadata: { publicKeyPrefix: publicKey.slice(0, 8) },
      _syncStatus: 'pending',
    })
  } catch {
    // Best-effort logging — don't block verification flow
  }
}

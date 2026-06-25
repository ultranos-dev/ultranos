import { verifySignature } from '@ultranos/sync-engine'
import type { SignedPrescriptionBundle } from './prescription-types'
import { db } from './db'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'
import { getCachedKey, revalidateKey } from './practitioner-key-cache'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'

export interface VerifiedPrescription {
  id: string
  med: string
  medN: string
  medT: string
  atc?: string      // ATC code carried from the QR (Phase 2) — used for brand/recall/interaction lookups
  brand?: string    // clinician's preferred brand carried from the QR (Phase 3C)
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
  | { status: 'key_untrusted_offline' }
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

  // Look up the clinician's public key in the trusted local cache
  const cachedKey = await getCachedKey(bundle.pub)
  if (!cachedKey) {
    return { status: 'unknown_clinician', fallbackAvailable: typeof navigator !== 'undefined' && navigator.onLine }
  }

  // Story 26.7 AC 1: If stale (TTL expired), revalidate before proceeding
  if (cachedKey.stale) {
    const revalidationResult = await revalidateStaleKey(bundle.pub)
    if (revalidationResult) return revalidationResult
    // null means key is active and refreshed — proceed with verification
  }

  // Decode and verify Ed25519 signature against the TRUSTED cached key
  const practitioner = {
    id: cachedKey.practitionerId,
    name: cachedKey.practitionerName,
    publicKeyRaw: cachedKey.publicKey,
  }
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

  // Audit: prescription QR scan/verify success (PHI access — prescription details)
  auditPhiAccess(
    useAuthSessionStore.getState().session?.userId ?? 'unknown',
    AuditAction.READ,
    AuditResourceType.PRESCRIPTION,
    'qr-scan-verify',
    prescriptions[0]?.pat,
    { phiAccess: 'prescription_scan_verify', prescriptionCount: prescriptions.length },
  )

  return {
    status: 'verified',
    prescriptions,
    practitionerName: practitioner.name,
  }
}

/**
 * Story 26.7: Attempt revalidation for a stale practitioner key.
 * Returns a VerificationResult if verification should stop (revoked/offline),
 * or null if the key is active and verification should proceed.
 */
async function revalidateStaleKey(
  pubKeyBase64: string,
): Promise<VerificationResult | null> {
  let authToken: string | null = null
  try {
    authToken = await useAuthSessionStore.getState().getAccessToken()
  } catch {
    // Auth unavailable — fail-closed
  }

  if (!authToken) {
    await logRevalidationOutcome(pubKeyBase64, 'auth_unavailable')
    return { status: 'key_untrusted_offline' }
  }

  const hubBaseUrl = getHubApiUrl()
  const result = await revalidateKey(pubKeyBase64, hubBaseUrl, authToken)

  // AC 4: Hub unreachable — fail-closed
  if (!result) {
    await logRevalidationOutcome(pubKeyBase64, 'hub_unreachable')
    return { status: 'key_untrusted_offline' }
  }

  // AC 3: Key revoked or expired — fail-closed
  if (result.status === 'revoked' || result.status === 'expired') {
    await logRevalidationOutcome(pubKeyBase64, result.status)
    return { status: 'key_revoked' }
  }

  // AC 2: Key active — cache refreshed by revalidateKey, proceed with verification
  await logRevalidationOutcome(pubKeyBase64, 'active')
  return null
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
 * Story 26.7: Audit revalidation outcomes for security traceability.
 * Contains only opaque identifiers — no PHI.
 */
async function logRevalidationOutcome(
  publicKey: string,
  outcome: 'active' | 'revoked' | 'expired' | 'hub_unreachable' | 'auth_unavailable',
): Promise<void> {
  try {
    await db.pendingAuditEvents.add({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actorRole: 'SYSTEM',
      action: 'PRACTITIONER_KEY_REVALIDATION',
      resourceType: 'PractitionerKey',
      outcome: outcome === 'active' ? 'SUCCESS' : 'DENIED',
      denialReason: outcome !== 'active' ? `Revalidation outcome: ${outcome}` : undefined,
      metadata: { publicKeyPrefix: publicKey.slice(0, 8), revalidationResult: outcome },
      _syncStatus: 'pending',
    })
  } catch {
    // Best-effort — don't block verification flow
  }
}


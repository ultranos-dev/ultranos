import { verifySignature } from '@ultranos/sync-engine'
import type { SignedPrescriptionBundle } from './prescription-signing'
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
  | { status: 'expired'; expiry: string }
  | { status: 'unknown_clinician'; fallbackAvailable: boolean }
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

  // Decode and verify Ed25519 signature
  let signature: Uint8Array
  let publicKey: Uint8Array
  try {
    signature = base64ToUint8(bundle.sig)
    publicKey = base64ToUint8(bundle.pub)
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

  // Look up the clinician's public key in local cache
  const practitioner = await lookupPractitionerByPublicKey(bundle.pub)
  if (!practitioner) {
    return { status: 'unknown_clinician', fallbackAvailable: typeof navigator !== 'undefined' && navigator.onLine }
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

async function lookupPractitionerByPublicKey(
  pubKeyBase64: string,
): Promise<{ id: string; name: string } | null> {
  try {
    const entry = await db.practitionerKeys.get({ publicKey: pubKeyBase64 })
    if (entry) {
      return { id: entry.practitionerId, name: entry.practitionerName }
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

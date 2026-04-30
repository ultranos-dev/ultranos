import type { FhirMedicationRequestZod, SignedPrescriptionBundle } from '@ultranos/shared-types'
import { signPayload } from '@ultranos/sync-engine'
import { compressPrescription } from './compress-prescription'

export type { SignedPrescriptionBundle } from '@ultranos/shared-types'

/** Default prescription expiry: 30 days in milliseconds */
const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

/**
 * Compress and sign a list of prescriptions for QR encoding.
 * The private key must come from the RAM-keyed store — never persisted.
 */
export async function signPrescriptionBundle(
  prescriptions: FhirMedicationRequestZod[],
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<SignedPrescriptionBundle> {
  const payload = compressPrescription(prescriptions)
  const signature = await signPayload(payload, privateKey)
  const now = new Date()

  return {
    payload,
    sig: uint8ToBase64(signature),
    pub: uint8ToBase64(publicKey),
    issued_at: now.toISOString(),
    expiry: new Date(now.getTime() + DEFAULT_EXPIRY_MS).toISOString(),
  }
}

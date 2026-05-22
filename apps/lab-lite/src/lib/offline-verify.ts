import nacl from 'tweetnacl'
import { getDb } from './db'

export interface QrPayload {
  pid: string
  iat: number
  exp: number
  sig: string
}

/**
 * Verify a Health Passport QR code offline using cached practitioner Ed25519 keys.
 * Iterates all cached keys to find one that produces a valid signature match.
 */
export async function verifyQrOffline(
  qrPayload: QrPayload,
): Promise<{ valid: boolean; reason?: string }> {
  // 1. Check expiry
  if (Date.now() / 1000 > qrPayload.exp) {
    return { valid: false, reason: 'QR code expired' }
  }

  // 2. Reconstruct signed message
  const message = `${qrPayload.pid}:${qrPayload.iat}:${qrPayload.exp}`
  const messageBytes = new TextEncoder().encode(message)
  const signatureBytes = Uint8Array.from(atob(qrPayload.sig), (c) => c.charCodeAt(0))

  // 3. Iterate all cached practitioner keys to find one that verifies
  const db = getDb()
  const keys = await db.practitioner_keys.toArray()

  if (keys.length === 0) {
    return { valid: false, reason: 'No cached verification keys' }
  }

  for (const key of keys) {
    try {
      const publicKeyBytes = Uint8Array.from(atob(key.publicKey), (c) => c.charCodeAt(0))
      const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)
      if (valid) {
        return { valid: true }
      }
    } catch {
      // Skip invalid keys
    }
  }

  return { valid: false, reason: 'No cached key verified this signature' }
}

/** Cache a practitioner's public key after online verification. */
export async function cachePractitionerKey(
  practitionerId: string,
  publicKey: string,
): Promise<void> {
  const db = getDb()
  await db.practitioner_keys.put({
    practitionerId,
    publicKey,
    cachedAt: new Date().toISOString(),
  })
}

/** Cache a verified patient (firstName + age only — CLAUDE.md Rule #7). */
export async function cacheVerifiedPatient(
  patientId: string,
  firstName: string,
  age: number,
): Promise<void> {
  const db = getDb()
  await db.verified_patients.put({
    patientId,
    firstName,
    age,
    verifiedAt: new Date().toISOString(),
  })
}

/** Look up cached patient. Returns null if not found or cache is older than 24 hours. */
export async function getCachedPatient(
  patientId: string,
): Promise<{ firstName: string; age: number } | null> {
  const db = getDb()
  const cached = await db.verified_patients.get(patientId)
  if (!cached) return null

  const ageMs = Date.now() - new Date(cached.verifiedAt).getTime()
  const maxAgeMs = 24 * 60 * 60 * 1000 // 24 hours
  if (ageMs > maxAgeMs) {
    await db.verified_patients.delete(patientId)
    return null
  }

  return { firstName: cached.firstName, age: cached.age }
}

/**
 * Health Record Encryption — AES-256-GCM via Web Crypto API
 * Story 47.3 — All clinical fields encrypted at rest in Dexie.
 *
 * Only `id`, `practitionerId`, and `lastUpdated` are stored in cleartext
 * for indexing and sync ordering. Everything else lives in a single encrypted blob.
 */

import type { EmployeeHealthRecord, EncryptedHealthRecord } from '@/types/employee-health'

type ClinicalFields = Omit<EmployeeHealthRecord, 'id' | 'practitionerId' | 'lastUpdated'>

/**
 * Encrypt all clinical fields of a health record using AES-256-GCM.
 * Preserves `id`, `practitionerId`, and `lastUpdated` in cleartext for Dexie indexing.
 */
export async function encryptHealthRecord(
  record: EmployeeHealthRecord,
  key: CryptoKey,
): Promise<EncryptedHealthRecord> {
  const { id, practitionerId, lastUpdated, ...clinicalFields } = record
  const plaintext = new TextEncoder().encode(JSON.stringify(clinicalFields))

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )

  return {
    id,
    practitionerId,
    encryptedPayload: ciphertext,
    iv,
    lastUpdated,
  }
}

/**
 * Decrypt a health record's clinical fields from the encrypted blob.
 * Returns the full EmployeeHealthRecord with all fields restored.
 */
export async function decryptHealthRecord(
  encrypted: EncryptedHealthRecord,
  key: CryptoKey,
): Promise<EmployeeHealthRecord> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encrypted.iv },
    key,
    encrypted.encryptedPayload,
  )

  const clinicalFields: ClinicalFields = JSON.parse(
    new TextDecoder().decode(plaintext),
  )

  return {
    id: encrypted.id,
    practitionerId: encrypted.practitionerId,
    lastUpdated: encrypted.lastUpdated,
    ...clinicalFields,
  }
}

/**
 * Generate an AES-256-GCM key for health record encryption.
 * In production, derive from the session key. This helper is for testing.
 */
export async function generateHealthRecordKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

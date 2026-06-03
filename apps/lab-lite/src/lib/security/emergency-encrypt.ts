/**
 * Story 49.4 — Emergency Encryption
 *
 * Generates a one-time AES-256-GCM key, encrypts all PHI records in Dexie,
 * and exports the key as base64 for USB/QR backup.
 *
 * NEVER stored on device — the encrypted key file or QR photograph must
 * be taken off-site by the lab manager.
 *
 * Tables encrypted (PHI): patients, uploadQueue, verified_patients, syncQueue,
 *   practitioner_keys, consentRecords, culturalPreferences
 *
 * Tables NOT encrypted:
 *   clientAuditLog — audit trail must stay readable for accountability
 *   dataBudgetConfig / dataUsage — non-PHI operational data
 */

import { getDb } from '@/lib/db'
import { setReadOnlyBypass } from '@/lib/security/read-only-guard'

const AES_GCM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_BYTES = 12

/** The Dexie table names that contain PHI and must be emergency-encrypted. */
export const PHI_TABLES = [
  'patients',
  'uploadQueue',
  'verified_patients',
  'syncQueue',
  'practitioner_keys',
  'consentRecords',
  'culturalPreferences',
  'lab_results',
  'samples',
  'smsQueue',
  'patientVerifications',
  'custody_events',
  'orders',
  'payments',
  'employee_health_records',
  'queueEntries',
  'amendments',
  'incident_reports',
  'labLogbook',
] as const

/** A record that has been emergency-encrypted. Stored back into the same table. */
export interface EncryptedRecord {
  id: unknown          // original primary key (preserved for table indexing)
  encryptedData: string // base64(iv + ciphertext) of the original record JSON
}

export interface EmergencyEncryptionResult {
  keyBase64: string    // exportable one-time AES-256-GCM key (base64 raw)
  encryptedCount: number
}

/** Encrypt a single record value with AES-256-GCM. Returns base64(iv+ciphertext). */
async function encryptValue(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: AES_GCM, iv }, key, plaintext)

  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_BYTES)

  return uint8ToBase64(combined)
}

/** Decrypt a base64(iv+ciphertext) back to the original record. */
export async function decryptEmergencyRecord(
  encryptedData: string,
  keyBase64: string,
): Promise<unknown> {
  const key = await importKeyFromBase64(keyBase64)
  return decryptValue(key, encryptedData)
}

async function decryptValue(key: CryptoKey, encoded: string): Promise<unknown> {
  const combined = base64ToUint8(encoded)
  const iv = combined.slice(0, IV_BYTES)
  const ciphertext = combined.slice(IV_BYTES)
  const plaintext = await crypto.subtle.decrypt({ name: AES_GCM, iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown
}

async function importKeyFromBase64(base64: string): Promise<CryptoKey> {
  const raw = base64ToUint8(base64)
  return crypto.subtle.importKey(
    'raw',
    raw.buffer as ArrayBuffer,
    { name: AES_GCM, length: KEY_LENGTH },
    false,
    ['decrypt'],
  )
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export type ProgressCallback = (tableName: string, processed: number, total: number) => void

/**
 * Perform emergency encryption of all PHI tables.
 *
 * Each record is replaced with { id, encryptedData } where encryptedData is
 * base64(iv + AES-256-GCM ciphertext of the original JSON-serialized record).
 *
 * The one-time key is returned as base64 and MUST be immediately exported
 * by the caller (USB download or QR display). It is not stored anywhere.
 *
 * @param onProgress - optional progress callback
 * @returns { keyBase64, encryptedCount }
 */
export async function performEmergencyEncryption(
  onProgress?: ProgressCallback,
): Promise<EmergencyEncryptionResult> {
  // Generate one-time extractable AES-256-GCM key
  const key = await crypto.subtle.generateKey(
    { name: AES_GCM, length: KEY_LENGTH },
    true, // extractable — we need to export it
    ['encrypt', 'decrypt'],
  )

  // Export key to base64 for manager to save
  const rawKey = await crypto.subtle.exportKey('raw', key)
  const keyBase64 = uint8ToBase64(new Uint8Array(rawKey))

  const db = getDb()
  let totalEncrypted = 0

  // Compute total record count upfront for accurate progress reporting
  let grandTotal = 0
  for (const tableName of PHI_TABLES) {
    try {
      grandTotal += await db.table(tableName).count()
    } catch {
      // Table may not exist in this schema version — skip
    }
  }

  // Bypass read-only guard for this privileged operation
  setReadOnlyBypass(true)
  try {
    for (const tableName of PHI_TABLES) {
      let table
      try {
        table = db.table(tableName)
      } catch {
        // Table may not exist in this schema version — skip
        continue
      }
      const records = await table.toArray() as Record<string, unknown>[]

      if (records.length === 0) continue

      // Extract primary key using Dexie schema (handles all key configurations)
      const primKeyPath = table.schema.primKey.keyPath as string | null
      const encryptedRecords: EncryptedRecord[] = []
      for (const record of records) {
        const id = primKeyPath ? record[primKeyPath] : record['id']
        const encryptedData = await encryptValue(key, record)
        encryptedRecords.push({ id, encryptedData })
      }

      // Replace all records in the table with encrypted versions
      await db.transaction('rw', table, async () => {
        await table.clear()
        for (const encRecord of encryptedRecords) {
          await table.put(encRecord)
        }
      })

      totalEncrypted += encryptedRecords.length
      onProgress?.(tableName, totalEncrypted, grandTotal)
    }
  } finally {
    setReadOnlyBypass(false)
  }

  return { keyBase64, encryptedCount: totalEncrypted }
}

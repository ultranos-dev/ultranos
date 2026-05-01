import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const CURRENT_VERSION = 'v1'
const PLACEHOLDER = '[Encrypted Content]'

/**
 * Encrypt a plaintext string using AES-256-GCM with a random IV.
 * Returns a versioned string: "v1:<base64(iv + authTag + ciphertext)>"
 *
 * The version prefix supports future key rotation — the decryptor
 * can select the correct key based on the version.
 */
export function encryptField(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(IV_BYTES)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Pack: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  return `${CURRENT_VERSION}:${combined.toString('base64')}`
}

/**
 * Decrypt a versioned ciphertext string back to plaintext.
 * Returns the "[Encrypted Content]" placeholder on any failure
 * (wrong key, tampered data, malformed input, unknown version)
 * rather than crashing the API response.
 */
export function decryptField(encrypted: string, keyHex: string): string {
  try {
    const colonIndex = encrypted.indexOf(':')
    if (colonIndex === -1) return PLACEHOLDER

    const version = encrypted.slice(0, colonIndex)
    const payload = encrypted.slice(colonIndex + 1)

    if (version !== CURRENT_VERSION || !payload) return PLACEHOLDER

    const combined = Buffer.from(payload, 'base64')
    if (combined.length < IV_BYTES + AUTH_TAG_BYTES + 1) return PLACEHOLDER

    const iv = combined.subarray(0, IV_BYTES)
    const authTag = combined.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES)
    const ciphertext = combined.subarray(IV_BYTES + AUTH_TAG_BYTES)

    const key = Buffer.from(keyHex, 'hex')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return decrypted.toString('utf8')
  } catch {
    return PLACEHOLDER
  }
}

/**
 * Generate a deterministic HMAC-SHA256 blind index for searchable encryption.
 * Used for equality lookups (e.g., national_id) without decrypting the stored value.
 *
 * The HMAC key MUST be different from the encryption key.
 */
export function generateBlindIndex(value: string, hmacKeyHex: string): string {
  return createHmac('sha256', Buffer.from(hmacKeyHex, 'hex'))
    .update(value)
    .digest('hex')
}

/**
 * Returns the encryption configuration — which DB columns use which encryption mode.
 *
 * randomizedFields: AES-256-GCM with random IV (non-deterministic). Cannot be searched.
 *
 * Note: national_id uses HMAC blind index for equality lookups (see generateBlindIndex)
 * but is not encrypted at rest in this config. Blind index generation is handled
 * directly in the patient router via generateBlindIndex().
 */
export function getEncryptionConfig() {
  return {
    randomizedFields: [
      'diagnosis',
      'reason_code',
      'dosage_instruction',
      'interaction_override',
      'medication_text',
      'soap_assessment',
      'soap_plan',
      // Lab result tables (Story 12.3)
      'report_conclusion',
      'encrypted_content',
    ] as const,
  }
}

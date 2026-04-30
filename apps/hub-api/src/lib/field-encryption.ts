import {
  encryptField,
  decryptField,
  getEncryptionConfig,
} from '@ultranos/crypto/server'

const { randomizedFields } = getEncryptionConfig()
const SENSITIVE_FIELDS = new Set<string>(randomizedFields)

/**
 * Returns the field encryption keys from environment variables.
 * Throws if keys are not configured — the API must not start without them.
 */
export function getFieldEncryptionKeys(): {
  encryptionKey: string
  hmacKey: string
} {
  const encryptionKey = process.env.FIELD_ENCRYPTION_KEY
  const hmacKey = process.env.FIELD_ENCRYPTION_HMAC_KEY

  if (!encryptionKey || !hmacKey) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY and FIELD_ENCRYPTION_HMAC_KEY must be set in environment variables',
    )
  }

  const hexPattern = /^[0-9a-f]{64}$/i
  if (!hexPattern.test(encryptionKey)) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY must be exactly 64 hex characters (256-bit key)',
    )
  }
  if (!hexPattern.test(hmacKey)) {
    throw new Error(
      'FIELD_ENCRYPTION_HMAC_KEY must be exactly 64 hex characters (256-bit key)',
    )
  }

  return { encryptionKey, hmacKey }
}

/**
 * Encrypt sensitive fields in a database row before insert/update.
 * Non-sensitive fields and null/undefined values pass through unchanged.
 * JSONB fields (arrays/objects) are JSON-stringified before encryption.
 */
export function encryptRow<T extends Record<string, unknown>>(
  row: T,
  encryptionKey: string,
): T {
  const result = { ...row }

  for (const field of SENSITIVE_FIELDS) {
    if (!(field in result)) continue
    const value = result[field]
    if (value == null) continue

    const plaintext =
      typeof value === 'string' ? value : JSON.stringify(value)
    ;(result as Record<string, unknown>)[field] = encryptField(
      plaintext,
      encryptionKey,
    )
  }

  return result
}

/**
 * Decrypt sensitive fields in a database row after select.
 * Returns "[Encrypted Content]" placeholder for any field that fails decryption
 * (tampered data, wrong key) rather than crashing the API response.
 *
 * Non-encrypted values (no "v1:" prefix) pass through unchanged to support
 * backward compatibility with pre-encryption data.
 *
 * JSONB fields are parsed back from JSON strings after decryption.
 */
export function decryptRow<T extends Record<string, unknown>>(
  row: T,
  encryptionKey: string,
): T {
  const result = { ...row }

  for (const field of SENSITIVE_FIELDS) {
    if (!(field in result)) continue
    const value = result[field]
    if (value == null) continue
    if (typeof value !== 'string') continue

    // Only decrypt values with the version prefix
    if (!value.startsWith('v1:')) continue

    const decrypted = decryptField(value, encryptionKey)

    // Try to parse JSON for JSONB fields (arrays/objects)
    if (decrypted !== '[Encrypted Content]') {
      try {
        const parsed = JSON.parse(decrypted) as unknown
        if (typeof parsed === 'object' && parsed !== null) {
          ;(result as Record<string, unknown>)[field] = parsed
          continue
        }
      } catch {
        // Not JSON — use as plain string
      }
    }

    ;(result as Record<string, unknown>)[field] = decrypted
  }

  return result
}

/**
 * Decrypt sensitive fields in an array of database rows.
 */
export function decryptRows<T extends Record<string, unknown>>(
  rows: T[],
  encryptionKey: string,
): T[] {
  return rows.map((row) => decryptRow(row, encryptionKey))
}

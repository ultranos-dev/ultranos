import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock environment before importing module
const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

const { encryptRow, decryptRow, decryptRows, getFieldEncryptionKeys } = await import(
  '../lib/field-encryption'
)

describe('field-encryption', () => {
  describe('getFieldEncryptionKeys', () => {
    it('returns keys from environment variables', () => {
      const keys = getFieldEncryptionKeys()
      expect(keys.encryptionKey).toBe(TEST_ENCRYPTION_KEY)
      expect(keys.hmacKey).toBe(TEST_HMAC_KEY)
    })
  })

  describe('encryptRow', () => {
    it('encrypts configured sensitive fields before DB insert', () => {
      const row = {
        id: '123',
        status: 'active',
        diagnosis: 'Diabetes mellitus type 2',
        reason_code: 'E11',
        medication_display: 'Metformin',
      }

      const encrypted = encryptRow(row, TEST_ENCRYPTION_KEY)

      // Non-sensitive fields remain unchanged
      expect(encrypted.id).toBe('123')
      expect(encrypted.status).toBe('active')
      expect(encrypted.medication_display).toBe('Metformin')

      // Sensitive fields are encrypted (v1: prefix)
      expect(encrypted.diagnosis).toMatch(/^v1:/)
      expect(encrypted.diagnosis).not.toBe('Diabetes mellitus type 2')
      expect(encrypted.reason_code).toMatch(/^v1:/)
    })

    it('skips null/undefined fields without error', () => {
      const row = {
        id: '123',
        diagnosis: null,
        reason_code: undefined,
      }

      const encrypted = encryptRow(row, TEST_ENCRYPTION_KEY)
      expect(encrypted.diagnosis).toBeNull()
      expect(encrypted.reason_code).toBeUndefined()
    })

    it('encrypts JSONB fields by stringifying first', () => {
      const row = {
        id: '123',
        dosage_instruction: [{ text: 'Take 500mg twice daily', route: 'oral' }],
      }

      const encrypted = encryptRow(row, TEST_ENCRYPTION_KEY)
      expect(encrypted.dosage_instruction).toMatch(/^v1:/)
    })

    it('leaves non-sensitive fields untouched', () => {
      const row = {
        id: '123',
        status: 'active',
        patient_id: '456',
        authored_on: '2026-01-01T00:00:00Z',
      }

      const encrypted = encryptRow(row, TEST_ENCRYPTION_KEY)
      expect(encrypted).toEqual(row)
    })
  })

  describe('decryptRow', () => {
    it('round-trips encrypted fields', () => {
      const original = {
        id: '123',
        status: 'active',
        diagnosis: 'Diabetes mellitus type 2',
        reason_code: 'E11',
      }

      const encrypted = encryptRow(original, TEST_ENCRYPTION_KEY)
      const decrypted = decryptRow(encrypted, TEST_ENCRYPTION_KEY)

      expect(decrypted.id).toBe('123')
      expect(decrypted.status).toBe('active')
      expect(decrypted.diagnosis).toBe('Diabetes mellitus type 2')
      expect(decrypted.reason_code).toBe('E11')
    })

    it('round-trips JSONB fields', () => {
      const original = {
        id: '123',
        dosage_instruction: [{ text: 'Take 500mg twice daily', route: 'oral' }],
      }

      const encrypted = encryptRow(original, TEST_ENCRYPTION_KEY)
      const decrypted = decryptRow(encrypted, TEST_ENCRYPTION_KEY)

      expect(decrypted.dosage_instruction).toEqual(original.dosage_instruction)
    })

    it('returns placeholder for tampered fields without crashing', () => {
      const encrypted = encryptRow(
        { id: '123', diagnosis: 'secret' },
        TEST_ENCRYPTION_KEY,
      )
      // Tamper with the ciphertext
      encrypted.diagnosis = 'v1:TAMPERED_DATA'

      const decrypted = decryptRow(encrypted, TEST_ENCRYPTION_KEY)
      expect(decrypted.id).toBe('123')
      expect(decrypted.diagnosis).toBe('[Encrypted Content]')
    })

    it('passes through null/undefined fields', () => {
      const row = { id: '123', diagnosis: null, reason_code: undefined }
      const decrypted = decryptRow(row, TEST_ENCRYPTION_KEY)
      expect(decrypted.diagnosis).toBeNull()
      expect(decrypted.reason_code).toBeUndefined()
    })

    it('passes through non-encrypted strings (no v1: prefix)', () => {
      const row = { id: '123', diagnosis: 'plain text without prefix' }
      const decrypted = decryptRow(row, TEST_ENCRYPTION_KEY)
      // Non-prefixed = legacy unencrypted data, pass through as-is
      expect(decrypted.diagnosis).toBe('plain text without prefix')
    })
  })

  describe('decryptRows', () => {
    it('decrypts all rows in an array', () => {
      const rows = [
        { id: '1', diagnosis: 'Condition A' },
        { id: '2', diagnosis: 'Condition B' },
      ]

      const encrypted = rows.map((r) => encryptRow(r, TEST_ENCRYPTION_KEY))
      const decrypted = decryptRows(encrypted, TEST_ENCRYPTION_KEY)

      expect(decrypted[0]!.diagnosis).toBe('Condition A')
      expect(decrypted[1]!.diagnosis).toBe('Condition B')
    })

    it('handles empty array', () => {
      expect(decryptRows([], TEST_ENCRYPTION_KEY)).toEqual([])
    })
  })
})

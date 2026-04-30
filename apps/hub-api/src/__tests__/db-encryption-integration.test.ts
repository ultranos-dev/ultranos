import { describe, it, expect, vi } from 'vitest'

const TEST_ENCRYPTION_KEY = 'a'.repeat(64)
const TEST_HMAC_KEY = 'b'.repeat(64)

vi.stubEnv('FIELD_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY)
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', TEST_HMAC_KEY)

// Mock Supabase client — we're testing the db helper, not Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({})),
}))

const { db } = await import('../lib/supabase')

describe('db helper with field-level encryption', () => {
  describe('toRow (write path)', () => {
    it('encrypts PHI fields when encryption key is provided', () => {
      const row = {
        id: '123',
        status: 'active',
        diagnosis: 'Type 2 Diabetes',
        reasonCode: 'E11.9',
      }

      const result = db.toRow(row, TEST_ENCRYPTION_KEY)

      // Case-transformed to snake_case
      expect(result.id).toBe('123')
      expect(result.status).toBe('active')

      // PHI fields are encrypted (camelCase → snake_case happens first, then encryption)
      expect(result.diagnosis).toMatch(/^v1:/)
      expect(result.reason_code).toMatch(/^v1:/)
    })

    it('does not encrypt when no key is provided', () => {
      const row = { diagnosis: 'Type 2 Diabetes' }
      const result = db.toRow(row)

      expect(result.diagnosis).toBe('Type 2 Diabetes')
    })
  })

  describe('fromRow (read path)', () => {
    it('decrypts PHI fields when encryption key is provided', () => {
      // Simulate an encrypted DB row (snake_case)
      const encrypted = db.toRow(
        { id: '123', diagnosis: 'Type 2 Diabetes', reasonCode: 'E11.9' },
        TEST_ENCRYPTION_KEY,
      )

      const decrypted = db.fromRow(encrypted, TEST_ENCRYPTION_KEY)

      // Decrypted and case-transformed to camelCase
      expect(decrypted.id).toBe('123')
      expect(decrypted.diagnosis).toBe('Type 2 Diabetes')
      expect(decrypted.reasonCode).toBe('E11.9')
    })

    it('handles null PHI fields gracefully', () => {
      const row = { id: '123', diagnosis: null }
      const result = db.fromRow(row, TEST_ENCRYPTION_KEY)
      expect(result.diagnosis).toBeNull()
    })
  })

  describe('fromRows (batch read path)', () => {
    it('decrypts all rows in an array', () => {
      const rows = [
        db.toRow({ id: '1', diagnosis: 'Condition A' }, TEST_ENCRYPTION_KEY),
        db.toRow({ id: '2', diagnosis: 'Condition B' }, TEST_ENCRYPTION_KEY),
      ]

      const decrypted = db.fromRows(rows, TEST_ENCRYPTION_KEY)
      expect(decrypted[0]!.diagnosis).toBe('Condition A')
      expect(decrypted[1]!.diagnosis).toBe('Condition B')
    })
  })

  describe('AC 3: only authorized requests trigger decryption', () => {
    it('returns raw encrypted data when no key is passed (no session)', () => {
      const encrypted = db.toRow(
        { id: '123', diagnosis: 'Secret' },
        TEST_ENCRYPTION_KEY,
      )

      // Without encryption key, the encrypted values pass through as-is
      const raw = db.fromRow(encrypted)
      expect(raw.diagnosis).toMatch(/^v1:/)
    })
  })

  describe('AC 5: no PHI in plaintext when encrypted', () => {
    it('encrypted row contains no readable PHI in any field', () => {
      const row = db.toRow(
        {
          id: '123',
          status: 'active',
          diagnosis: 'Hypertension stage 2',
          reasonCode: 'I11',
          dosageInstruction: [{ text: 'Take 10mg daily' }],
          interactionOverride: 'Approved by Dr. Smith',
        },
        TEST_ENCRYPTION_KEY,
      )

      // Non-PHI fields are in plaintext (expected)
      expect(row.id).toBe('123')
      expect(row.status).toBe('active')

      // All PHI fields are encrypted — no readable content
      const rowStr = JSON.stringify(row)
      expect(rowStr).not.toContain('Hypertension')
      expect(rowStr).not.toContain('I11')
      expect(rowStr).not.toContain('Take 10mg daily')
      expect(rowStr).not.toContain('Dr. Smith')
    })
  })
})

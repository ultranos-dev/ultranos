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

describe('db helper with mandatory field-level encryption (Story 7.3b)', () => {
  describe('toRow (write path)', () => {
    it('automatically encrypts PHI fields without requiring a key parameter', () => {
      const row = {
        id: '123',
        status: 'active',
        diagnosis: 'Type 2 Diabetes',
        reasonCode: 'E11.9',
      }

      const result = db.toRow(row)

      // Case-transformed to snake_case
      expect(result.id).toBe('123')
      expect(result.status).toBe('active')

      // PHI fields are encrypted (camelCase → snake_case happens first, then encryption)
      expect(result.diagnosis).toMatch(/^v1:/)
      expect(result.reason_code).toMatch(/^v1:/)
    })

    it('writing a SENSITIVE_FIELD without encryption is impossible through db.toRow()', () => {
      // AC 8: There is no way to call db.toRow() and get plaintext PHI
      const row = { diagnosis: 'Type 2 Diabetes' }
      const result = db.toRow(row)

      expect(result.diagnosis).toMatch(/^v1:/)
      expect(result.diagnosis).not.toBe('Type 2 Diabetes')
    })
  })

  describe('toRowRaw (escape hatch)', () => {
    it('applies case transform without encryption when reason is provided', () => {
      const row = {
        recipientRef: 'user-123',
        notificationType: 'LAB_RESULT',
        status: 'QUEUED',
      }

      const result = db.toRowRaw(row, 'non-PHI: notifications')

      expect(result.recipient_ref).toBe('user-123')
      expect(result.notification_type).toBe('LAB_RESULT')
      expect(result.status).toBe('QUEUED')
    })

    it('throws TypeError when reason string is missing', () => {
      const row = { status: 'active' }

      // @ts-expect-error — intentionally omitting required reason parameter
      expect(() => db.toRowRaw(row)).toThrow(TypeError)
      // @ts-expect-error — empty string is not a valid reason
      expect(() => db.toRowRaw(row, '')).toThrow(TypeError)
    })

    it('throws if data contains SENSITIVE_FIELDS', () => {
      const row = {
        diagnosis: 'Type 2 Diabetes',
        reasonCode: 'E11.9',
      }

      expect(() => db.toRowRaw(row, 'non-PHI: test')).toThrow(
        'db.toRowRaw() cannot write sensitive field "diagnosis"',
      )
    })

    it('passes non-PHI data through without encryption', () => {
      const row = {
        recipientRef: 'user-1',
        status: 'QUEUED',
      }

      const result = db.toRowRaw(row, 'non-PHI: notifications')

      expect(result.recipient_ref).toBe('user-1')
      expect(result.status).toBe('QUEUED')
    })
  })

  describe('fromRow (read path)', () => {
    it('automatically decrypts PHI fields without requiring a key parameter', () => {
      // Simulate an encrypted DB row (snake_case)
      const encrypted = db.toRow(
        { id: '123', diagnosis: 'Type 2 Diabetes', reasonCode: 'E11.9' },
      )

      const decrypted = db.fromRow(encrypted)

      // Decrypted and case-transformed to camelCase
      expect(decrypted.id).toBe('123')
      expect(decrypted.diagnosis).toBe('Type 2 Diabetes')
      expect(decrypted.reasonCode).toBe('E11.9')
    })

    it('handles null PHI fields gracefully', () => {
      const row = { id: '123', diagnosis: null }
      const result = db.fromRow(row)
      expect(result.diagnosis).toBeNull()
    })
  })

  describe('fromRowRaw (non-PHI read path)', () => {
    it('applies case transform without decryption', () => {
      const row = {
        recipient_ref: 'user-123',
        created_at: '2026-01-01',
        status: 'QUEUED',
      }

      const result = db.fromRowRaw(row)

      expect(result.recipientRef).toBe('user-123')
      expect(result.createdAt).toBe('2026-01-01')
      expect(result.status).toBe('QUEUED')
    })
  })

  describe('fromRows (batch read path)', () => {
    it('decrypts all rows in an array', () => {
      const rows = [
        db.toRow({ id: '1', diagnosis: 'Condition A' }),
        db.toRow({ id: '2', diagnosis: 'Condition B' }),
      ]

      const decrypted = db.fromRows(rows)
      expect(decrypted[0]!.diagnosis).toBe('Condition A')
      expect(decrypted[1]!.diagnosis).toBe('Condition B')
    })
  })

  describe('AC 5: no PHI in plaintext when encrypted', () => {
    it('encrypted row contains no readable PHI in any field', () => {
      const row = db.toRow({
        id: '123',
        status: 'active',
        diagnosis: 'Hypertension stage 2',
        reasonCode: 'I11',
        dosageInstruction: [{ text: 'Take 10mg daily' }],
        interactionOverride: 'Approved by Dr. Smith',
      })

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

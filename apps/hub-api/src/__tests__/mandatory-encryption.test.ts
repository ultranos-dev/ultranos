import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 7.3b: Mandatory Encryption Wiring — dedicated tests.
 * Tests that encryption is mandatory, toRowRaw requires a reason,
 * and missing env vars throw before any data flows.
 */

describe('mandatory encryption (Story 7.3b)', () => {
  describe('AC 4: missing FIELD_ENCRYPTION_KEY throws before data flows', () => {
    it('getCachedEncryptionKey() throws when env vars are not set', async () => {
      // Import a fresh module without env vars set
      vi.resetModules()
      // Don't stub env vars — leave them unset
      vi.stubEnv('FIELD_ENCRYPTION_KEY', '')
      vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', '')

      const { getCachedEncryptionKey } = await import('../lib/field-encryption')

      expect(() => getCachedEncryptionKey()).toThrow(
        'FIELD_ENCRYPTION_KEY and FIELD_ENCRYPTION_HMAC_KEY must be set',
      )
    })

    it('validateEncryptionConfig() throws when env vars are not set', async () => {
      vi.resetModules()
      vi.stubEnv('FIELD_ENCRYPTION_KEY', '')
      vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', '')

      const { validateEncryptionConfig } = await import('../lib/field-encryption')

      expect(() => validateEncryptionConfig()).toThrow(
        'FIELD_ENCRYPTION_KEY and FIELD_ENCRYPTION_HMAC_KEY must be set',
      )
    })
  })

  describe('AC 1, 2: db.toRow() always encrypts, key resolved internally', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
      vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))
    })

    it('db.toRow() produces encrypted output for SENSITIVE_FIELDS (starts with v1:)', async () => {
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => ({})),
      }))

      const { db } = await import('../lib/supabase')

      const result = db.toRow({
        id: '123',
        diagnosis: 'Hypertension',
        soapAssessment: 'Patient presenting with elevated BP',
      })

      // PHI fields must be encrypted
      expect(result.diagnosis).toMatch(/^v1:/)
      expect(result.soap_assessment).toMatch(/^v1:/)

      // Non-PHI passes through
      expect(result.id).toBe('123')
    })

    it('db.fromRow() decrypts back to plaintext', async () => {
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => ({})),
      }))

      const { db } = await import('../lib/supabase')

      const encrypted = db.toRow({ diagnosis: 'Hypertension' })
      const decrypted = db.fromRow(encrypted)

      expect(decrypted.diagnosis).toBe('Hypertension')
    })
  })

  describe('AC 3, 9: db.toRowRaw() escape hatch', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
      vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))
    })

    it('requires a reason string parameter', async () => {
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => ({})),
      }))

      const { db } = await import('../lib/supabase')

      // @ts-expect-error — intentionally testing runtime check
      expect(() => db.toRowRaw({ status: 'QUEUED' })).toThrow(TypeError)
      expect(() => db.toRowRaw({ status: 'QUEUED' }, '')).toThrow(TypeError)
      expect(() => db.toRowRaw({ status: 'QUEUED' }, '   ')).toThrow(TypeError)
    })

    it('throws if data contains SENSITIVE_FIELDS', async () => {
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => ({})),
      }))

      const { db } = await import('../lib/supabase')

      expect(() => db.toRowRaw({ diagnosis: 'Diabetes' }, 'non-PHI: test')).toThrow(
        'db.toRowRaw() cannot write sensitive field "diagnosis"',
      )
    })

    it('passes data through without encryption when reason is provided', async () => {
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => ({})),
      }))

      const { db } = await import('../lib/supabase')

      const result = db.toRowRaw(
        { recipientRef: 'user-1', status: 'QUEUED' },
        'non-PHI: notifications',
      )

      expect(result.recipient_ref).toBe('user-1')
      expect(result.status).toBe('QUEUED')
      // No v1: prefix — plaintext
      expect(result.recipient_ref).not.toMatch(/^v1:/)
    })
  })

  describe('AC 8: writing a SENSITIVE_FIELD without encryption is impossible', () => {
    beforeEach(() => {
      vi.resetModules()
      vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
      vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))
    })

    it('db.toRow() always encrypts SENSITIVE_FIELDS — no opt-out', async () => {
      vi.mock('@supabase/supabase-js', () => ({
        createClient: vi.fn(() => ({})),
      }))

      const { db } = await import('../lib/supabase')

      // Build a row with ALL sensitive fields in camelCase
      const data = {
        id: '123',
        status: 'active',
        diagnosis: 'PLAINTEXT_DIAGNOSIS',
        reasonCode: 'PLAINTEXT_REASON',
        dosageInstruction: 'PLAINTEXT_DOSAGE',
        interactionOverride: 'PLAINTEXT_OVERRIDE',
        medicationText: 'PLAINTEXT_MED',
        soapAssessment: 'PLAINTEXT_SOAP_A',
        soapPlan: 'PLAINTEXT_SOAP_P',
        reportConclusion: 'PLAINTEXT_REPORT',
        encryptedContent: 'PLAINTEXT_CONTENT',
      }

      const result = db.toRow(data)
      const resultStr = JSON.stringify(result)

      // No SENSITIVE_FIELD plaintext should appear in the output
      expect(resultStr).not.toContain('PLAINTEXT_DIAGNOSIS')
      expect(resultStr).not.toContain('PLAINTEXT_REASON')
      expect(resultStr).not.toContain('PLAINTEXT_DOSAGE')
      expect(resultStr).not.toContain('PLAINTEXT_OVERRIDE')
      expect(resultStr).not.toContain('PLAINTEXT_MED')
      expect(resultStr).not.toContain('PLAINTEXT_SOAP_A')
      expect(resultStr).not.toContain('PLAINTEXT_SOAP_P')
      expect(resultStr).not.toContain('PLAINTEXT_REPORT')
      expect(resultStr).not.toContain('PLAINTEXT_CONTENT')

      // Non-sensitive fields remain in plaintext
      expect(resultStr).toContain('123')
      expect(resultStr).toContain('active')

      // All encrypted values should have v1: prefix
      const values = Object.values(result).filter(
        (v) => typeof v === 'string' && v !== '123' && v !== 'active',
      )
      for (const val of values) {
        expect(val).toMatch(/^v1:/)
      }
    })
  })
})

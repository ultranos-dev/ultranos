import { describe, it, expect } from 'vitest'
import {
  encryptField,
  decryptField,
  generateBlindIndex,
  getEncryptionConfig,
} from '../server-crypto'

// Test key: 256-bit hex string (32 bytes = 64 hex chars)
const TEST_KEY_HEX = 'a'.repeat(64)
const TEST_HMAC_KEY_HEX = 'b'.repeat(64)

describe('server-crypto', () => {
  describe('encryptField', () => {
    it('produces a versioned ciphertext string', () => {
      const result = encryptField('hello world', TEST_KEY_HEX)
      expect(result).toMatch(/^v1:/)
    })

    it('produces different ciphertext for the same plaintext (random IV)', () => {
      const a = encryptField('same input', TEST_KEY_HEX)
      const b = encryptField('same input', TEST_KEY_HEX)
      expect(a).not.toBe(b)
    })

    it('encrypts empty string', () => {
      const result = encryptField('', TEST_KEY_HEX)
      expect(result).toMatch(/^v1:/)
    })

    it('encrypts unicode/RTL text', () => {
      const arabic = 'مرحبا بالعالم'
      const result = encryptField(arabic, TEST_KEY_HEX)
      expect(result).toMatch(/^v1:/)
      const decrypted = decryptField(result, TEST_KEY_HEX)
      expect(decrypted).toBe(arabic)
    })

    it('encrypts long clinical notes', () => {
      const longText = 'Patient presents with '.repeat(1000)
      const result = encryptField(longText, TEST_KEY_HEX)
      expect(result).toMatch(/^v1:/)
      const decrypted = decryptField(result, TEST_KEY_HEX)
      expect(decrypted).toBe(longText)
    })
  })

  describe('decryptField', () => {
    it('round-trips plaintext through encrypt/decrypt', () => {
      const plaintext = 'Assessment: Patient shows improvement'
      const encrypted = encryptField(plaintext, TEST_KEY_HEX)
      const decrypted = decryptField(encrypted, TEST_KEY_HEX)
      expect(decrypted).toBe(plaintext)
    })

    it('returns placeholder for tampered ciphertext', () => {
      const encrypted = encryptField('secret', TEST_KEY_HEX)
      // Corrupt the ciphertext portion (after v1: prefix)
      const parts = encrypted.split(':')
      const corrupted = parts[0] + ':' + parts[1]!.slice(0, -4) + 'XXXX'
      const result = decryptField(corrupted, TEST_KEY_HEX)
      expect(result).toBe('[Encrypted Content]')
    })

    it('returns placeholder for wrong key', () => {
      const encrypted = encryptField('secret', TEST_KEY_HEX)
      const wrongKey = 'c'.repeat(64)
      const result = decryptField(encrypted, wrongKey)
      expect(result).toBe('[Encrypted Content]')
    })

    it('returns placeholder for malformed input', () => {
      expect(decryptField('not-encrypted', TEST_KEY_HEX)).toBe('[Encrypted Content]')
      expect(decryptField('', TEST_KEY_HEX)).toBe('[Encrypted Content]')
      expect(decryptField('v1:', TEST_KEY_HEX)).toBe('[Encrypted Content]')
    })

    it('returns placeholder for unknown version prefix', () => {
      const result = decryptField('v99:someciphertext', TEST_KEY_HEX)
      expect(result).toBe('[Encrypted Content]')
    })
  })

  describe('generateBlindIndex', () => {
    it('produces a deterministic hex hash', () => {
      const a = generateBlindIndex('12345', TEST_HMAC_KEY_HEX)
      const b = generateBlindIndex('12345', TEST_HMAC_KEY_HEX)
      expect(a).toBe(b)
      expect(a).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces different hashes for different inputs', () => {
      const a = generateBlindIndex('12345', TEST_HMAC_KEY_HEX)
      const b = generateBlindIndex('67890', TEST_HMAC_KEY_HEX)
      expect(a).not.toBe(b)
    })

    it('produces different hashes with different keys', () => {
      const a = generateBlindIndex('12345', TEST_HMAC_KEY_HEX)
      const b = generateBlindIndex('12345', 'c'.repeat(64))
      expect(a).not.toBe(b)
    })
  })

  describe('getEncryptionConfig', () => {
    it('returns config with field lists', () => {
      const config = getEncryptionConfig()
      expect(config.randomizedFields).toContain('diagnosis')
      expect(config.randomizedFields).toContain('reason_code')
      expect(config.randomizedFields).toContain('dosage_instruction')
      expect(config.randomizedFields).toContain('interaction_override')
      expect(config.deterministicFields).toContain('national_id')
    })
  })
})

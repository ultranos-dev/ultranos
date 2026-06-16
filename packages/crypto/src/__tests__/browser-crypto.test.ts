import { describe, it, expect } from 'vitest'
import {
  generateSessionKey,
  deriveSessionKey,
  encryptPayload,
  decryptPayload,
  exportKey,
  importKey,
} from '../browser-crypto.js'

describe('browser-crypto', () => {
  describe('generateSessionKey', () => {
    it('generates a CryptoKey for AES-256-GCM', async () => {
      const key = await generateSessionKey()
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
      expect(key.extractable).toBe(true)
      expect(key.usages).toContain('encrypt')
      expect(key.usages).toContain('decrypt')
    })

    it('generates unique keys each time', async () => {
      const key1 = await generateSessionKey()
      const key2 = await generateSessionKey()
      const raw1 = await exportKey(key1)
      const raw2 = await exportKey(key2)
      expect(raw1).not.toEqual(raw2)
    })
  })

  describe('encryptPayload / decryptPayload', () => {
    it('round-trips a simple object', async () => {
      const key = await generateSessionKey()
      const data = { name: 'Ahmad', diagnosis: 'Flu' }
      const encrypted = await encryptPayload(key, data)
      expect(typeof encrypted).toBe('string')
      // Encrypted output should not contain plaintext
      expect(encrypted).not.toContain('Ahmad')
      expect(encrypted).not.toContain('Flu')

      const decrypted = await decryptPayload(key, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('round-trips nested FHIR-like objects', async () => {
      const key = await generateSessionKey()
      const patient = {
        resourceType: 'Patient',
        id: 'p-123',
        name: [{ family: 'Al-Hassan', given: ['Omar'] }],
        _ultranos: {
          nameLocal: 'عمر الحسن',
          nationalIdHash: 'abc123hash',
        },
      }
      const encrypted = await encryptPayload(key, patient)
      const decrypted = await decryptPayload(key, encrypted)
      expect(decrypted).toEqual(patient)
    })

    it('round-trips arrays', async () => {
      const key = await generateSessionKey()
      const data = [1, 'two', { three: 3 }]
      const encrypted = await encryptPayload(key, data)
      const decrypted = await decryptPayload(key, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('round-trips strings', async () => {
      const key = await generateSessionKey()
      const data = 'plain text value'
      const encrypted = await encryptPayload(key, data)
      const decrypted = await decryptPayload(key, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('produces different ciphertexts for the same input (unique IV)', async () => {
      const key = await generateSessionKey()
      const data = { same: 'data' }
      const enc1 = await encryptPayload(key, data)
      const enc2 = await encryptPayload(key, data)
      expect(enc1).not.toEqual(enc2)
    })

    it('fails to decrypt with wrong key', async () => {
      const key1 = await generateSessionKey()
      const key2 = await generateSessionKey()
      const encrypted = await encryptPayload(key1, { secret: true })
      await expect(decryptPayload(key2, encrypted)).rejects.toThrow()
    })

    it('fails on tampered ciphertext', async () => {
      const key = await generateSessionKey()
      const encrypted = await encryptPayload(key, { data: 'safe' })
      // Flip a character in the ciphertext portion (after the IV prefix)
      const tampered = encrypted.slice(0, 20) + 'X' + encrypted.slice(21)
      await expect(decryptPayload(key, tampered)).rejects.toThrow()
    })
  })

  describe('deriveSessionKey', () => {
    const makeSalt = () => crypto.getRandomValues(new Uint8Array(16))

    it('returns a CryptoKey for AES-256-GCM', async () => {
      const salt = makeSalt()
      const key = await deriveSessionKey('user-sub-123', salt)
      expect(key).toBeInstanceOf(CryptoKey)
      expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
      expect(key.usages).toContain('encrypt')
      expect(key.usages).toContain('decrypt')
    })

    it('is non-extractable by default', async () => {
      const salt = makeSalt()
      const key = await deriveSessionKey('user-sub-123', salt)
      expect(key.extractable).toBe(false)
    })

    it('is deterministic — same sub + salt always produces the same key', async () => {
      const sub = 'a1b2c3d4-uuid-sub'
      const salt = makeSalt()

      const key1 = await deriveSessionKey(sub, salt)
      const key2 = await deriveSessionKey(sub, salt)

      // Verify by encrypting with key1 and decrypting with key2
      const plaintext = { patient: 'test', value: 42 }
      const ciphertext = await encryptPayload(key1, plaintext)
      const decrypted = await decryptPayload(key2, ciphertext)
      expect(decrypted).toEqual(plaintext)
    })

    it('different sub values produce different keys', async () => {
      const salt = makeSalt()

      const key1 = await deriveSessionKey('sub-user-A', salt)
      const key2 = await deriveSessionKey('sub-user-B', salt)

      const plaintext = { data: 'secret' }
      const ciphertext = await encryptPayload(key1, plaintext)
      await expect(decryptPayload(key2, ciphertext)).rejects.toThrow()
    })

    it('different salts produce different keys', async () => {
      const sub = 'same-sub-value'
      const salt1 = makeSalt()
      const salt2 = makeSalt()

      const key1 = await deriveSessionKey(sub, salt1)
      const key2 = await deriveSessionKey(sub, salt2)

      const plaintext = { data: 'secret' }
      const ciphertext = await encryptPayload(key1, plaintext)
      await expect(decryptPayload(key2, ciphertext)).rejects.toThrow()
    })

    it('completes within 500ms (OWASP performance threshold)', async () => {
      const sub = 'perf-test-sub-uuid'
      const salt = makeSalt()

      const start = performance.now()
      await deriveSessionKey(sub, salt)
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(500)
    })

    it('accepts a UUID-shaped sub claim', async () => {
      const sub = '550e8400-e29b-41d4-a716-446655440000'
      const salt = makeSalt()
      const key = await deriveSessionKey(sub, salt)
      expect(key).toBeInstanceOf(CryptoKey)
    })

    it('page-refresh scenario: re-derived key reads previous encrypted data', async () => {
      const sub = 'refresh-scenario-sub'
      const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])

      // Simulate first page load: derive key and encrypt data
      const firstKey = await deriveSessionKey(sub, salt)
      const sensitiveData = { diagnosis: 'obfuscated-code' }
      const encrypted = await encryptPayload(firstKey, sensitiveData)

      // Simulate page refresh: re-derive from same sub + same device salt
      const refreshedKey = await deriveSessionKey(sub, salt)
      const decrypted = await decryptPayload(refreshedKey, encrypted)

      expect(decrypted).toEqual(sensitiveData)
    })
  })

  describe('exportKey / importKey', () => {
    it('round-trips a key through export and import', async () => {
      const original = await generateSessionKey()
      const exported = await exportKey(original)
      expect(typeof exported).toBe('string')

      const imported = await importKey(exported)
      expect(imported).toBeInstanceOf(CryptoKey)

      // Verify the imported key works
      const data = { test: 'round-trip' }
      const encrypted = await encryptPayload(original, data)
      const decrypted = await decryptPayload(imported, encrypted)
      expect(decrypted).toEqual(data)
    })
  })
})

import { describe, it, expect } from 'vitest'
import {
  generateSessionKey,
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

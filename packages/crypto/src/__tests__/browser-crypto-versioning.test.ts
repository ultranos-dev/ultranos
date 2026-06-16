/**
 * Tests for Story 28.5: Key Rotation with Version-Prefixed Payloads
 *
 * Covers:
 *   - v1: prefix on encrypt output
 *   - Version-aware decryption via key map
 *   - Legacy (no-prefix) backward compatibility
 *   - UnknownKeyVersionError for unrecognised prefix
 *   - deriveKeyForVersion helper for rotation key derivation
 *   - v1 → v2 re-encryption round-trip
 */

import { describe, it, expect } from 'vitest'
import {
  generateSessionKey,
  deriveSessionKey,
  deriveKeyForVersion,
  encryptPayload,
  decryptPayload,
  exportKey,
  UnknownKeyVersionError,
} from '../browser-crypto.js'

describe('version-prefixed payloads (Story 28.5)', () => {
  // ─── AC 1: v1: prefix, version-aware reads ──────────────────────────────

  describe('encryptPayload — version prefix', () => {
    it('prepends the default v1: version prefix', async () => {
      const key = await generateSessionKey()
      const encrypted = await encryptPayload(key, { hello: 'world' })
      expect(encrypted).toMatch(/^v1:/)
    })

    it('prepends a custom version prefix when specified', async () => {
      const key = await generateSessionKey()
      const encrypted = await encryptPayload(key, { x: 1 }, 'v2')
      expect(encrypted).toMatch(/^v2:/)
    })

    it('does not embed plaintext in the encrypted output', async () => {
      const key = await generateSessionKey()
      const encrypted = await encryptPayload(key, { name: 'Ahmad', diagnosis: 'Flu' })
      expect(encrypted).not.toContain('Ahmad')
      expect(encrypted).not.toContain('Flu')
    })

    it('produces different ciphertexts for the same input (unique IV per encrypt)', async () => {
      const key = await generateSessionKey()
      const enc1 = await encryptPayload(key, { same: 'data' })
      const enc2 = await encryptPayload(key, { same: 'data' })
      expect(enc1).not.toEqual(enc2)
    })
  })

  describe('decryptPayload — single CryptoKey (backward-compat)', () => {
    it('round-trips a v1-prefixed payload when single key passed', async () => {
      const key = await generateSessionKey()
      const data = { name: 'Omar', age: 30 }
      const encrypted = await encryptPayload(key, data)
      expect(encrypted).toMatch(/^v1:/)
      const decrypted = await decryptPayload(key, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('round-trips strings, arrays, and nested objects', async () => {
      const key = await generateSessionKey()
      const cases = [
        'plain text value',
        [1, 'two', { three: 3 }],
        { nested: { deep: { value: true } } },
      ]
      for (const data of cases) {
        const encrypted = await encryptPayload(key, data)
        const decrypted = await decryptPayload(key, encrypted)
        expect(decrypted).toEqual(data)
      }
    })
  })

  describe('decryptPayload — key map', () => {
    it('decrypts v1 payload using { v1: key } map', async () => {
      const key = await generateSessionKey()
      const data = { record: 'v1-only' }
      const encrypted = await encryptPayload(key, data, 'v1')
      const decrypted = await decryptPayload({ v1: key }, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('decrypts v2 payload using { v1: old, v2: new } map', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const data = { record: 'v2-rotation' }
      const encrypted = await encryptPayload(v2Key, data, 'v2')
      const decrypted = await decryptPayload({ v1: v1Key, v2: v2Key }, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('reads v1 payload with two-key map (mixed rotation window)', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const data = { tier: 'old-v1' }
      const encrypted = await encryptPayload(v1Key, data, 'v1')
      const decrypted = await decryptPayload({ v1: v1Key, v2: v2Key }, encrypted)
      expect(decrypted).toEqual(data)
    })

    it('reads v2 payload with two-key map (mixed rotation window)', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const data = { tier: 'new-v2' }
      const encrypted = await encryptPayload(v2Key, data, 'v2')
      const decrypted = await decryptPayload({ v1: v1Key, v2: v2Key }, encrypted)
      expect(decrypted).toEqual(data)
    })
  })

  // ─── Legacy (pre-rotation) backward compatibility ────────────────────────

  describe('legacy payloads without version prefix', () => {
    it('treats a raw base64 payload (no prefix) as v1', async () => {
      const key = await generateSessionKey()
      const data = { legacy: true }
      // Craft a legacy payload by stripping the "v1:" prefix from a fresh encryption
      const prefixed = await encryptPayload(key, data, 'v1')
      const legacyPayload = prefixed.slice('v1:'.length)

      // Should decrypt successfully as implicit v1
      const decrypted = await decryptPayload(key, legacyPayload)
      expect(decrypted).toEqual(data)
    })

    it('treats legacy payload as v1 using key map', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const data = { legacy: 'pre-rotation' }
      const prefixed = await encryptPayload(v1Key, data, 'v1')
      const legacyPayload = prefixed.slice('v1:'.length)

      const decrypted = await decryptPayload({ v1: v1Key, v2: v2Key }, legacyPayload)
      expect(decrypted).toEqual(data)
    })
  })

  // ─── AC 3: UnknownKeyVersionError ────────────────────────────────────────

  describe('UnknownKeyVersionError', () => {
    it('thrown when key map has no entry for the payload version', async () => {
      const key = await generateSessionKey()
      await expect(decryptPayload({ v1: key }, 'v99:AAAA')).rejects.toThrow(
        UnknownKeyVersionError,
      )
    })

    it('carries the unrecognised version string on the error', async () => {
      const key = await generateSessionKey()
      try {
        await decryptPayload({ v1: key }, 'v42:AAAA')
        expect.fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(UnknownKeyVersionError)
        expect((err as UnknownKeyVersionError).version).toBe('v42')
        expect((err as UnknownKeyVersionError).name).toBe('UnknownKeyVersionError')
      }
    })

    it('thrown when a single key is used against a different-version ciphertext', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const encrypted = await encryptPayload(v2Key, { secret: true }, 'v2')
      // Single v1 key → key map becomes { v1: v1Key } → no v2 entry → UnknownKeyVersionError
      await expect(decryptPayload(v1Key, encrypted)).rejects.toThrow(
        UnknownKeyVersionError,
      )
    })

    it('is an Error subclass with a meaningful message', () => {
      const err = new UnknownKeyVersionError('v77')
      expect(err).toBeInstanceOf(Error)
      expect(err.message).toContain('v77')
      expect(err.version).toBe('v77')
    })
  })

  // ─── deriveKeyForVersion ─────────────────────────────────────────────────

  describe('deriveKeyForVersion (Story 28.5 rotation key derivation)', () => {
    it('v1 result matches deriveSessionKey with the same (sub, salt)', async () => {
      const sub = 'user-abc'
      const salt = new Uint8Array(16).fill(7)
      const v1Key = await deriveKeyForVersion(sub, salt, 'v1', true)
      const baseKey = await deriveSessionKey(sub, salt, true)
      expect(await exportKey(v1Key)).toBe(await exportKey(baseKey))
    })

    it('v2 key differs from v1 key (version bytes appended to salt)', async () => {
      const sub = 'user-abc'
      const salt = new Uint8Array(16).fill(7)
      const v1Key = await deriveKeyForVersion(sub, salt, 'v1', true)
      const v2Key = await deriveKeyForVersion(sub, salt, 'v2', true)
      expect(await exportKey(v1Key)).not.toBe(await exportKey(v2Key))
    })

    it('v2 key is deterministic given the same (sub, deviceSalt)', async () => {
      const sub = 'user-xyz'
      const salt = new Uint8Array(16).fill(3)
      const a = await deriveKeyForVersion(sub, salt, 'v2', true)
      const b = await deriveKeyForVersion(sub, salt, 'v2', true)
      expect(await exportKey(a)).toBe(await exportKey(b))
    })

    it('different subs → different v2 keys', async () => {
      const salt = new Uint8Array(16).fill(5)
      const keyA = await deriveKeyForVersion('user-A', salt, 'v2', true)
      const keyB = await deriveKeyForVersion('user-B', salt, 'v2', true)
      expect(await exportKey(keyA)).not.toBe(await exportKey(keyB))
    })

    it('v1 key + v2 key in map correctly decrypt their respective payloads', async () => {
      const sub = 'clinician-007'
      const salt = new Uint8Array(16).fill(9)
      const v1Key = await deriveKeyForVersion(sub, salt, 'v1', true)
      const v2Key = await deriveKeyForVersion(sub, salt, 'v2', true)

      const oldData = { id: 'old-record', generation: 1 }
      const newData = { id: 'new-record', generation: 2 }
      const v1Ciphertext = await encryptPayload(v1Key, oldData, 'v1')
      const v2Ciphertext = await encryptPayload(v2Key, newData, 'v2')

      const keyMap = { v1: v1Key, v2: v2Key }
      expect(await decryptPayload(keyMap, v1Ciphertext)).toEqual(oldData)
      expect(await decryptPayload(keyMap, v2Ciphertext)).toEqual(newData)
    })
  })

  // ─── AC 2: v1 → v2 re-encryption round-trip ─────────────────────────────

  describe('re-encryption round-trip — v1 → v2 migration', () => {
    it('re-encrypts v1 records to v2 and discards old v1 key', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const records = Array.from({ length: 5 }, (_, i) => ({
        id: `rec-${i}`,
        patientId: `p-${i}`,
        value: i * 10,
      }))

      // Step 1: Write with v1 key (simulates existing data before rotation)
      const v1Ciphertexts = await Promise.all(
        records.map((r) => encryptPayload(v1Key, r, 'v1')),
      )

      // Step 2: Key rotation — both keys in map, v2 is the write key
      const keyMapBothKeys = { v1: v1Key, v2: v2Key }

      // Step 3: Re-encrypt — decrypt with full map, re-encrypt with v2
      const v2Ciphertexts = await Promise.all(
        v1Ciphertexts.map(async (ct) => {
          const plain = await decryptPayload(keyMapBothKeys, ct)
          return encryptPayload(v2Key, plain, 'v2')
        }),
      )

      // All re-encrypted payloads carry the v2 prefix
      v2Ciphertexts.forEach((ct) => expect(ct).toMatch(/^v2:/))

      // Step 4: Retire v1 key — only v2 key available
      const keyMapV2Only = { v2: v2Key }
      const recovered = await Promise.all(
        v2Ciphertexts.map((ct) => decryptPayload(keyMapV2Only, ct)),
      )
      expect(recovered).toEqual(records)
    })

    it('old v1 ciphertext cannot be decrypted with v2-only key map', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const oldCiphertext = await encryptPayload(v1Key, { id: 'old' }, 'v1')
      await expect(
        decryptPayload({ v2: v2Key }, oldCiphertext),
      ).rejects.toThrow(UnknownKeyVersionError)
    })

    it('processes 100+ records correctly (batching representative test)', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const records = Array.from({ length: 150 }, (_, i) => ({ id: i, data: `record-${i}` }))

      const v1Ciphertexts = await Promise.all(
        records.map((r) => encryptPayload(v1Key, r, 'v1')),
      )

      const keyMap = { v1: v1Key, v2: v2Key }
      const v2Ciphertexts = await Promise.all(
        v1Ciphertexts.map(async (ct) => {
          const plain = await decryptPayload(keyMap, ct)
          return encryptPayload(v2Key, plain, 'v2')
        }),
      )

      expect(v2Ciphertexts).toHaveLength(150)
      const recovered = await Promise.all(
        v2Ciphertexts.map((ct) => decryptPayload({ v2: v2Key }, ct)),
      )
      expect(recovered).toEqual(records)
    })

    it('concurrent read/write during re-encryption does not corrupt data', async () => {
      const v1Key = await generateSessionKey()
      const v2Key = await generateSessionKey()
      const keyMap = { v1: v1Key, v2: v2Key }

      const records = Array.from({ length: 20 }, (_, i) => ({ id: i, value: `r${i}` }))
      const v1Ciphertexts = await Promise.all(
        records.map((r) => encryptPayload(v1Key, r, 'v1')),
      )

      // Concurrent: some re-encrypting to v2, some still reading v1 in parallel
      const results = await Promise.all(
        v1Ciphertexts.map(async (ct, i) => {
          if (i % 2 === 0) {
            // Re-encrypt path
            const plain = await decryptPayload(keyMap, ct)
            const v2ct = await encryptPayload(v2Key, plain, 'v2')
            return decryptPayload({ v2: v2Key }, v2ct)
          } else {
            // Read-only path (still on v1)
            return decryptPayload(keyMap, ct)
          }
        }),
      )

      expect(results).toEqual(records)
    })
  })
})

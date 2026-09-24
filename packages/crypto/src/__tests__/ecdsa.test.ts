import { describe, it, expect } from 'vitest'
import {
  generateEcdsaKeyPair,
  signWithEcdsa,
  verifyEcdsaSignature,
  verifyIdentityQrPayload,
  canonicalJsonStringify,
} from '../ecdsa.js'

describe('ecdsa', () => {
  describe('generateEcdsaKeyPair', () => {
    it('generates a key pair with non-empty base64 strings', async () => {
      const keyPair = await generateEcdsaKeyPair()
      expect(typeof keyPair.publicKey).toBe('string')
      expect(typeof keyPair.privateKey).toBe('string')
      expect(keyPair.publicKey.length).toBeGreaterThan(0)
      expect(keyPair.privateKey.length).toBeGreaterThan(0)
    })

    it('produces unique keys each call', async () => {
      const kp1 = await generateEcdsaKeyPair()
      const kp2 = await generateEcdsaKeyPair()
      expect(kp1.publicKey).not.toEqual(kp2.publicKey)
      expect(kp1.privateKey).not.toEqual(kp2.privateKey)
    })
  })

  describe('signWithEcdsa / verifyEcdsaSignature', () => {
    it('sign then verify round-trip succeeds', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const payload = JSON.stringify({ pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 })

      const signature = await signWithEcdsa(privateKey, payload)
      expect(typeof signature).toBe('string')
      expect(signature.length).toBeGreaterThan(0)

      const valid = await verifyEcdsaSignature(publicKey, payload, signature)
      expect(valid).toBe(true)
    })

    it('verify with wrong public key returns false', async () => {
      const kp1 = await generateEcdsaKeyPair()
      const kp2 = await generateEcdsaKeyPair()
      const payload = 'test payload'

      const signature = await signWithEcdsa(kp1.privateKey, payload)
      const valid = await verifyEcdsaSignature(kp2.publicKey, payload, signature)
      expect(valid).toBe(false)
    })

    it('verify with tampered payload returns false', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const payload = 'original payload'

      const signature = await signWithEcdsa(privateKey, payload)
      const valid = await verifyEcdsaSignature(publicKey, 'tampered payload', signature)
      expect(valid).toBe(false)
    })

    it('verify with tampered signature returns false', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const payload = 'test payload'

      const signature = await signWithEcdsa(privateKey, payload)
      // Flip a character in the signature
      const tampered = signature.slice(0, 10) + 'X' + signature.slice(11)
      const valid = await verifyEcdsaSignature(publicKey, payload, tampered)
      expect(valid).toBe(false)
    })

    it('sign different payloads produces different signatures', async () => {
      const { privateKey } = await generateEcdsaKeyPair()

      const sig1 = await signWithEcdsa(privateKey, 'payload one')
      const sig2 = await signWithEcdsa(privateKey, 'payload two')
      expect(sig1).not.toEqual(sig2)
    })

    it('signature is compact base64 (~88 chars for 64-byte raw)', async () => {
      const { privateKey } = await generateEcdsaKeyPair()
      const signature = await signWithEcdsa(privateKey, 'compact test')
      // 64 bytes raw (r||s) → base64 is 88 chars
      expect(signature.length).toBe(88)
    })
  })

  describe('verifyIdentityQrPayload', () => {
    // Story 61.2: signing contract is now canonical JSON (sorted keys) and exp is
    // enforced. `notExpired` pins the clock before the fixtures' exp so signature
    // behaviour can be tested independently of expiry.
    const notExpired = { now: Date.parse('2026-01-01T12:00:00Z') }

    it('verifies a valid signed QR payload (canonical-JSON contract)', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      const baseString = canonicalJsonStringify(basePayload)
      const sig = await signWithEcdsa(privateKey, baseString)
      const qrString = JSON.stringify({ ...basePayload, sig })

      const valid = await verifyIdentityQrPayload(publicKey, qrString, notExpired)
      expect(valid).toBe(true)
    })

    it('verifies regardless of QR key ORDER (canonical JSON fixes brittleness)', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      // Signer canonicalizes.
      const sig = await signWithEcdsa(privateKey, canonicalJsonStringify(basePayload))
      // Scanner reconstructs the QR object in a DIFFERENT key order + sig.
      const qrString = JSON.stringify({ v: 1, sig, exp: basePayload.exp, iat: basePayload.iat, pid: basePayload.pid })

      const valid = await verifyIdentityQrPayload(publicKey, qrString, notExpired)
      expect(valid).toBe(true)
    })

    it('returns false for payload without sig field', async () => {
      const { publicKey } = await generateEcdsaKeyPair()
      const qrString = JSON.stringify({ pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 })

      const valid = await verifyIdentityQrPayload(publicKey, qrString, notExpired)
      expect(valid).toBe(false)
    })

    it('returns false for tampered payload', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      const sig = await signWithEcdsa(privateKey, canonicalJsonStringify(basePayload))
      const tampered = { ...basePayload, pid: 'patient-2', sig }

      const valid = await verifyIdentityQrPayload(publicKey, JSON.stringify(tampered), notExpired)
      expect(valid).toBe(false)
    })

    it('returns false for wrong public key', async () => {
      const kp1 = await generateEcdsaKeyPair()
      const kp2 = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      const sig = await signWithEcdsa(kp1.privateKey, canonicalJsonStringify(basePayload))
      const qrString = JSON.stringify({ ...basePayload, sig })

      const valid = await verifyIdentityQrPayload(kp2.publicKey, qrString, notExpired)
      expect(valid).toBe(false)
    })

    it('returns false for invalid JSON', async () => {
      const { publicKey } = await generateEcdsaKeyPair()
      const valid = await verifyIdentityQrPayload(publicKey, 'not json')
      expect(valid).toBe(false)
    })

    // ─── Story 61.2: exp enforcement ─────────────────────────────────────────
    it('rejects a validly-signed but EXPIRED passport (ISO exp)', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      const sig = await signWithEcdsa(privateKey, canonicalJsonStringify(basePayload))
      const qrString = JSON.stringify({ ...basePayload, sig })

      // now is AFTER exp → expired.
      const valid = await verifyIdentityQrPayload(publicKey, qrString, { now: Date.parse('2026-06-01T00:00:00Z') })
      expect(valid).toBe(false)
    })

    it('accepts a non-expired passport (now before exp)', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      const sig = await signWithEcdsa(privateKey, canonicalJsonStringify(basePayload))
      const qrString = JSON.stringify({ ...basePayload, sig })

      const valid = await verifyIdentityQrPayload(publicKey, qrString, { now: Date.parse('2026-01-01T06:00:00Z') })
      expect(valid).toBe(true)
    })

    it('enforces numeric epoch exp (seconds and ms both accepted)', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const expSeconds = 1_800_000_000 // ~2027, epoch seconds
      const basePayload = { pid: 'p', iat: 1_700_000_000, exp: expSeconds, v: 1 }
      const sig = await signWithEcdsa(privateKey, canonicalJsonStringify(basePayload))
      const qrString = JSON.stringify({ ...basePayload, sig })

      expect(await verifyIdentityQrPayload(publicKey, qrString, { now: 1_750_000_000_000 })).toBe(true)
      expect(await verifyIdentityQrPayload(publicKey, qrString, { now: 1_900_000_000_000 })).toBe(false)
    })

    it('does not enforce expiry when enforceExpiry:false (still checks signature)', async () => {
      const { publicKey, privateKey } = await generateEcdsaKeyPair()
      const basePayload = { pid: 'patient-1', iat: '2026-01-01T00:00:00Z', exp: '2026-01-02T00:00:00Z', v: 1 }
      const sig = await signWithEcdsa(privateKey, canonicalJsonStringify(basePayload))
      const qrString = JSON.stringify({ ...basePayload, sig })

      const valid = await verifyIdentityQrPayload(publicKey, qrString, { now: Date.parse('2030-01-01T00:00:00Z'), enforceExpiry: false })
      expect(valid).toBe(true)
    })
  })

  describe('canonicalJsonStringify', () => {
    it('sorts object keys at every level (order-independent)', () => {
      const a = canonicalJsonStringify({ b: 1, a: { d: 4, c: 3 } })
      const b = canonicalJsonStringify({ a: { c: 3, d: 4 }, b: 1 })
      expect(a).toBe(b)
      expect(a).toBe('{"a":{"c":3,"d":4},"b":1}')
    })

    it('preserves array order', () => {
      expect(canonicalJsonStringify({ xs: [3, 1, 2] })).toBe('{"xs":[3,1,2]}')
    })
  })
})

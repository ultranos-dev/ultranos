/**
 * Story 61.2 / P-CRYPTO-4 — tamper signaling on decryptField.
 *
 * The silent "[Encrypted Content]" swallow on a GCM auth-tag failure is replaced
 * by a discriminated result (decryptFieldResult) and an onIntegrityFailure hook on
 * decryptField, so tampering is signaled (and auditable) instead of masked. The
 * placeholder remains as a safe UI display fallback.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  encryptField,
  decryptField,
  decryptFieldResult,
  type DecryptFailureReason,
} from '../server-crypto'

const KEY = 'a'.repeat(64)
const OTHER_KEY = 'b'.repeat(64)
const PLACEHOLDER = '[Encrypted Content]'

/**
 * Corrupt the ciphertext by decoding the base64 body, flipping a byte in the
 * ciphertext region (past the 12-byte IV + 16-byte tag), and re-encoding. Byte-level
 * corruption guarantees a GCM auth-tag mismatch (a base64-char flip can land on
 * padding and be a no-op).
 */
function bitFlipCiphertext(ct: string): string {
  const colon = ct.indexOf(':')
  const prefix = ct.slice(0, colon + 1)
  const bytes = Buffer.from(ct.slice(colon + 1), 'base64')
  const idx = bytes.length - 1 // last ciphertext byte
  bytes[idx] = bytes[idx]! ^ 0xff
  return prefix + bytes.toString('base64')
}

describe('tamper signaling (Story 61.2 / P-CRYPTO-4)', () => {
  describe('decryptFieldResult — discriminated result', () => {
    it('returns ok:true with the plaintext on a valid decrypt', () => {
      const ct = encryptField('opaque clinical value', KEY)
      const result = decryptFieldResult(ct, KEY)
      expect(result).toEqual({ ok: true, value: 'opaque clinical value' })
    })

    it('signals AUTH_TAG_FAILURE on a bit-flipped ciphertext (tamper)', () => {
      const ct = encryptField('sensitive', KEY)
      const tampered = bitFlipCiphertext(ct)
      const result = decryptFieldResult(tampered, KEY)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('AUTH_TAG_FAILURE')
    })

    it('signals AUTH_TAG_FAILURE on a wrong key (not a false "no content")', () => {
      const ct = encryptField('sensitive', KEY)
      const result = decryptFieldResult(ct, OTHER_KEY)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('AUTH_TAG_FAILURE')
    })

    it('signals UNKNOWN_VERSION for an unrecognised prefix', () => {
      const result = decryptFieldResult('v9:AAAA', KEY)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('UNKNOWN_VERSION')
    })

    it('signals MALFORMED for input without a version prefix', () => {
      const result = decryptFieldResult('not-encrypted-plaintext', KEY)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('MALFORMED')
    })

    it('signals MALFORMED for a too-short payload', () => {
      const result = decryptFieldResult('v1:QUFB', KEY) // decodes to <IV+tag bytes
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason).toBe('MALFORMED')
    })
  })

  describe('decryptField — hook + safe placeholder fallback', () => {
    it('still returns the plaintext on a valid decrypt (backward compatible)', () => {
      const ct = encryptField('hello', KEY)
      expect(decryptField(ct, KEY)).toBe('hello')
    })

    it('returns the placeholder AND invokes the hook with AUTH_TAG_FAILURE on tamper', () => {
      const ct = encryptField('sensitive', KEY)
      const tampered = bitFlipCiphertext(ct)
      const reasons: DecryptFailureReason[] = []
      const out = decryptField(tampered, KEY, (r) => reasons.push(r))
      expect(out).toBe(PLACEHOLDER)
      expect(reasons).toEqual(['AUTH_TAG_FAILURE'])
    })

    it('does NOT invoke the hook on a successful decrypt', () => {
      const ct = encryptField('ok', KEY)
      const hook = vi.fn()
      decryptField(ct, KEY, hook)
      expect(hook).not.toHaveBeenCalled()
    })

    it('is backward compatible when no hook is passed (no throw, placeholder returned)', () => {
      const ct = encryptField('x', KEY)
      const tampered = bitFlipCiphertext(ct)
      expect(decryptField(tampered, KEY)).toBe(PLACEHOLDER)
    })
  })
})

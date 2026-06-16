import { describe, it, expect, vi } from 'vitest'
vi.mock('@ultranos/crypto/server', () => ({
  decryptField: (c: string) => c.replace('enc:', ''),
  generateBlindIndex: (v: string) => `idx:${v}`,
  getEncryptionConfig: () => ({ randomizedFields: [] }),
}))
// Mock field-encryption to avoid env-var validation at module load time
vi.mock('../lib/field-encryption', () => ({
  getFieldEncryptionKeys: () => ({ encryptionKey: 'k'.repeat(64), hmacKey: 'h'.repeat(64) }),
}))
import { computePhoneIndex } from '../../scripts/backfill-practitioner-phone-index'

describe('computePhoneIndex', () => {
  it('decrypts the stored phone then blind-indexes it', () => {
    expect(computePhoneIndex('enc:+93700000000', 'k', 'h')).toBe('idx:+93700000000')
  })
  it('returns null for empty/missing phone', () => {
    expect(computePhoneIndex('', 'k', 'h')).toBeNull()
    expect(computePhoneIndex(null, 'k', 'h')).toBeNull()
  })
})

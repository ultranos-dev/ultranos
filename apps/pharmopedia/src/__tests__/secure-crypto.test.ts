import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>()
  return { getItemAsync: async (k: string) => store.get(k) ?? null, setItemAsync: async (k: string, v: string) => { store.set(k, v) }, deleteItemAsync: async (k: string) => { store.delete(k) } }
})
vi.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = (i * 7 + 3) % 256; return a } }))

import { encryptJson, decryptJson, getOrCreateCacheKey } from '@/lib/secure-crypto'

describe('secure-crypto', () => {
  beforeEach(() => { vi.clearAllMocks() })
  it('round-trips an object through AES-256-GCM', async () => {
    const obj = { kind: 'patient', displayName: 'Sara', phone: '+93700000000' }
    const enc = await encryptJson(obj)
    expect(enc.ciphertext).toEqual(expect.any(String))
    expect(enc.iv).toEqual(expect.any(String))
    expect(enc.ciphertext).not.toContain('Sara')
    const back = await decryptJson<typeof obj>(enc)
    expect(back).toEqual(obj)
  })
  it('persists one key across calls', async () => {
    const k1 = await getOrCreateCacheKey()
    const k2 = await getOrCreateCacheKey()
    expect(k1).toBe(k2)
  })
})

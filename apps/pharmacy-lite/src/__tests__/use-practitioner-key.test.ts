import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'

// Track fetch calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const KEY_CACHE_TTL_MS = 24 * 60 * 60 * 1000

describe('practitioner key cache TTL', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.practitionerKeys.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getCachedKey', () => {
    it('returns cached key when within TTL (AC 1)', async () => {
      const { getCachedKey } = await import('@/lib/practitioner-key-cache')

      await db.practitionerKeys.put({
        publicKey: 'test-key-b64',
        practitionerId: 'prac-1',
        practitionerName: 'Dr. Test',
        cachedAt: new Date().toISOString(),
      })

      const result = await getCachedKey('test-key-b64')
      expect(result).not.toBeNull()
      expect(result!.practitionerId).toBe('prac-1')
      expect(result!.stale).toBe(false)
    })

    it('marks key as stale when TTL expired (AC 1, AC 2)', async () => {
      const { getCachedKey } = await import('@/lib/practitioner-key-cache')

      const staleTime = new Date(Date.now() - KEY_CACHE_TTL_MS - 1000).toISOString()
      await db.practitionerKeys.put({
        publicKey: 'stale-key-b64',
        practitionerId: 'prac-2',
        practitionerName: 'Dr. Stale',
        cachedAt: staleTime,
      })

      const result = await getCachedKey('stale-key-b64')
      expect(result).not.toBeNull()
      expect(result!.stale).toBe(true)
    })

    it('returns null when key not in cache', async () => {
      const { getCachedKey } = await import('@/lib/practitioner-key-cache')

      const result = await getCachedKey('nonexistent-key')
      expect(result).toBeNull()
    })
  })

  describe('revalidateKey', () => {
    it('re-fetches key from Hub API when stale (AC 2)', async () => {
      const { revalidateKey } = await import('@/lib/practitioner-key-cache')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'active',
          practitionerId: 'prac-1',
          publicKey: 'revalidated-key-b64',
          revokedAt: null,
          expiresAt: '2027-01-01T00:00:00Z',
        }),
      })

      const result = await revalidateKey('revalidated-key-b64', 'https://hub.test', 'token-123')
      expect(result).not.toBeNull()
      expect(result!.status).toBe('active')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('updates local cache after successful revalidation', async () => {
      const { revalidateKey } = await import('@/lib/practitioner-key-cache')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'active',
          practitionerId: 'prac-1',
          publicKey: 'updated-key-b64',
          revokedAt: null,
          expiresAt: '2027-01-01T00:00:00Z',
          practitionerName: 'Dr. Updated',
        }),
      })

      await revalidateKey('updated-key-b64', 'https://hub.test', 'token-123')

      const cached = await db.practitionerKeys.get('updated-key-b64')
      expect(cached).toBeDefined()
      expect(cached!.practitionerId).toBe('prac-1')
    })

    it('deletes local cache when key is revoked (AC 3, AC 4)', async () => {
      const { revalidateKey } = await import('@/lib/practitioner-key-cache')

      await db.practitionerKeys.put({
        publicKey: 'revoked-key-b64',
        practitionerId: 'prac-3',
        practitionerName: 'Dr. Revoked',
        cachedAt: new Date().toISOString(),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'revoked',
          practitionerId: 'prac-3',
          publicKey: 'revoked-key-b64',
          revokedAt: '2026-06-01T00:00:00Z',
          expiresAt: '2027-01-01T00:00:00Z',
        }),
      })

      const result = await revalidateKey('revoked-key-b64', 'https://hub.test', 'token-123')
      expect(result!.status).toBe('revoked')

      const cached = await db.practitionerKeys.get('revoked-key-b64')
      expect(cached).toBeUndefined()
    })

    it('returns null on network failure (fail-closed)', async () => {
      const { revalidateKey } = await import('@/lib/practitioner-key-cache')

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await revalidateKey('fail-key-b64', 'https://hub.test', 'token-123')
      expect(result).toBeNull()
    })
  })
})

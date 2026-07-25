import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/lib/db'

// Mock audit module before importing worker
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { SYNC: 'SYNC' },
  AuditResourceType: { PRACTITIONER: 'PRACTITIONER' },
}))

// Mock trpc module
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: () => 'http://hub.test/api/trpc',
}))

import {
  startKrlSync,
  stopKrlSync,
  isKrlSyncRunning,
  syncKrl,
  fetchKrlFromHub,
  purgeRevokedFromCache,
  KRL_POLL_INTERVAL_MS,
} from '@/lib/krl-sync-worker'
import { auditPhiAccess } from '@/lib/audit'

const mockAudit = vi.mocked(auditPhiAccess)

function mockGetAccessToken(token: string | null = 'test-token') {
  return vi.fn().mockResolvedValue(token)
}

function krlResponse(revokedKeys: Array<{ publicKey: string; revokedAt: string }>, nextCursor?: string) {
  return new Response(
    JSON.stringify({ result: { data: { json: { revokedKeys, nextCursor } } } }),
    { status: 200 },
  )
}

describe('krl-sync-worker', () => {
  beforeEach(async () => {
    await db.revokedKeys.clear()
    await db.practitionerKeys.clear()
    vi.clearAllMocks()
    stopKrlSync()
  })

  afterEach(() => {
    stopKrlSync()
    vi.restoreAllMocks()
  })

  describe('fetchKrlFromHub', () => {
    it('fetches all revoked keys with pagination', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(krlResponse(
          [{ publicKey: 'key-1', revokedAt: '2026-01-01T00:00:00Z' }],
          '2026-01-01T00:00:00Z',
        ))
        .mockResolvedValueOnce(krlResponse(
          [{ publicKey: 'key-2', revokedAt: '2026-01-02T00:00:00Z' }],
        ))

      const result = await fetchKrlFromHub(mockGetAccessToken())

      expect(result).toEqual([
        { publicKey: 'key-1', revokedAt: '2026-01-01T00:00:00Z' },
        { publicKey: 'key-2', revokedAt: '2026-01-02T00:00:00Z' },
      ])
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('returns null when no auth token available', async () => {
      const result = await fetchKrlFromHub(mockGetAccessToken(null))
      expect(result).toBeNull()
    })

    it('returns null on network failure (fail-closed)', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchKrlFromHub(mockGetAccessToken())
      expect(result).toBeNull()
    })

    it('returns null on non-OK HTTP response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 500 }))

      const result = await fetchKrlFromHub(mockGetAccessToken())
      expect(result).toBeNull()
    })
  })

  describe('purgeRevokedFromCache', () => {
    it('purges matching keys from practitioner cache', async () => {
      await db.practitionerKeys.bulkPut([
        { publicKey: 'key-a', practitionerId: 'p1', practitionerName: 'Dr. A', cachedAt: new Date().toISOString() },
        { publicKey: 'key-b', practitionerId: 'p2', practitionerName: 'Dr. B', cachedAt: new Date().toISOString() },
        { publicKey: 'key-c', practitionerId: 'p3', practitionerName: 'Dr. C', cachedAt: new Date().toISOString() },
      ])

      const purged = await purgeRevokedFromCache([
        { publicKey: 'key-a', revokedAt: '2026-01-01T00:00:00Z' },
        { publicKey: 'key-c', revokedAt: '2026-01-02T00:00:00Z' },
      ])

      expect(purged).toBe(2)
      const remaining = await db.practitionerKeys.toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].publicKey).toBe('key-b')
    })

    it('returns 0 when no matching keys in cache', async () => {
      await db.practitionerKeys.put({
        publicKey: 'safe-key',
        practitionerId: 'p1',
        practitionerName: 'Dr. Safe',
        cachedAt: new Date().toISOString(),
      })

      const purged = await purgeRevokedFromCache([
        { publicKey: 'other-key', revokedAt: '2026-01-01T00:00:00Z' },
      ])

      expect(purged).toBe(0)
      const remaining = await db.practitionerKeys.toArray()
      expect(remaining).toHaveLength(1)
    })

    it('returns 0 for empty KRL entries', async () => {
      const purged = await purgeRevokedFromCache([])
      expect(purged).toBe(0)
    })
  })

  describe('syncKrl', () => {
    it('applies snapshot and emits success audit on successful fetch', async () => {
      const entries = [{ publicKey: 'revoked-1', revokedAt: '2026-01-01T00:00:00Z' }]
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(krlResponse(entries))

      await syncKrl(mockGetAccessToken(), 'actor-1')

      const stored = await db.revokedKeys.toArray()
      expect(stored).toHaveLength(1)
      expect(stored[0].publicKey).toBe('revoked-1')

      expect(mockAudit).toHaveBeenCalledWith(
        'actor-1',
        'SYNC',
        'PRACTITIONER',
        'krl',
        undefined,
        expect.objectContaining({
          outcome: 'success',
          revokedKeyCount: 1,
          newRevocations: 1,
        }),
      )
    })

    it('retains existing KRL on network failure and emits failure audit', async () => {
      await db.revokedKeys.put({ publicKey: 'existing-key', revokedAt: '2026-01-01T00:00:00Z' })

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))

      await syncKrl(mockGetAccessToken(), 'actor-1')

      // Existing KRL retained (fail-closed)
      const stored = await db.revokedKeys.toArray()
      expect(stored).toHaveLength(1)
      expect(stored[0].publicKey).toBe('existing-key')

      expect(mockAudit).toHaveBeenCalledWith(
        'actor-1',
        'SYNC',
        'PRACTITIONER',
        'krl',
        undefined,
        expect.objectContaining({ outcome: 'failure' }),
      )
    })

    it('purges revoked keys from practitioner cache after sync', async () => {
      await db.practitionerKeys.put({
        publicKey: 'to-revoke',
        practitionerId: 'p1',
        practitionerName: 'Dr. Revoked',
        cachedAt: new Date().toISOString(),
      })

      const entries = [{ publicKey: 'to-revoke', revokedAt: '2026-01-01T00:00:00Z' }]
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(krlResponse(entries))

      await syncKrl(mockGetAccessToken(), 'actor-1')

      const cached = await db.practitionerKeys.toArray()
      expect(cached).toHaveLength(0)

      expect(mockAudit).toHaveBeenCalledWith(
        'actor-1',
        'SYNC',
        'PRACTITIONER',
        'krl',
        undefined,
        expect.objectContaining({ purgedFromCache: 1 }),
      )
    })
  })

  describe('startKrlSync / stopKrlSync lifecycle', () => {
    it('starts running and stops cleanly', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(krlResponse([]))

      expect(isKrlSyncRunning()).toBe(false)
      startKrlSync(mockGetAccessToken(), 'actor-1')
      expect(isKrlSyncRunning()).toBe(true)
      stopKrlSync()
      expect(isKrlSyncRunning()).toBe(false)
    })

    it('uses 5-minute polling interval', () => {
      expect(KRL_POLL_INTERVAL_MS).toBe(5 * 60 * 1000)
    })

    it('triggers immediate sync on start and on online event', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(krlResponse([]))

      startKrlSync(mockGetAccessToken(), 'actor-1')
      // Flush microtasks so the async sync fires fetch
      await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled())
      const callsAfterStart = fetchSpy.mock.calls.length

      // Simulate coming online — triggers another async sync
      window.dispatchEvent(new Event('online'))
      await vi.waitFor(() => expect(fetchSpy.mock.calls.length).toBe(callsAfterStart + 1))

      // After stop, online event should not trigger sync
      stopKrlSync()
      window.dispatchEvent(new Event('online'))
      // Small wait to confirm no new calls
      await new Promise((r) => setTimeout(r, 10))
      expect(fetchSpy.mock.calls.length).toBe(callsAfterStart + 1)
    })

    it('sets up and tears down interval timer', () => {
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(krlResponse([]))

      startKrlSync(mockGetAccessToken(), 'actor-1')
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), KRL_POLL_INTERVAL_MS)

      stopKrlSync()
      expect(clearIntervalSpy).toHaveBeenCalled()
    })

    it('removes online event listener on stop', () => {
      const removeListenerSpy = vi.spyOn(window, 'removeEventListener')
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(krlResponse([]))

      startKrlSync(mockGetAccessToken(), 'actor-1')
      stopKrlSync()

      expect(removeListenerSpy).toHaveBeenCalledWith('online', expect.any(Function))
    })
  })
})

/**
 * Story 60.2 (AC 1 + AC 2) — OPD sync queue fail-safe hardening.
 *
 * AC 1: when encryption is unavailable at enqueue time (no session key, or
 * encryptPayload throws mid-call), the payload is NEVER stored as plaintext
 * in IndexedDB. It is held in memory only and flushed (encrypted + enqueued)
 * once the key is restored.
 *
 * AC 2: storage failures (QuotaExceededError, IndexedDB corruption) surface
 * to the sync UI (syncError) and emit an audit failure event — never only a
 * console.warn.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const VALID_HLC = '000001789169375:00000:node-test'

const baseInput = {
  resourceType: 'AllergyIntolerance',
  resourceId: 'a1a1a1a1-0000-0000-0000-00000000abcd',
  action: 'update' as const,
  hlcTimestamp: VALID_HLC,
  payload: '{"substance":"PLAINTEXT-PHI-MARKER"}',
}

/** Audit spy shared across dynamic imports within one test. */
function mockAudit() {
  const auditPhiAccess = vi.fn()
  vi.doMock('../lib/audit', () => ({
    auditPhiAccess,
    AuditAction: { SYNC: 'SYNC' },
    AuditResourceType: {},
  }))
  return auditPhiAccess
}

/**
 * vi.resetModules() gives each test a FRESH encryption-key-store singleton
 * (without the session key that setup.ts installed on the original instance),
 * so tests that need a present key must mock the store explicitly.
 */
function mockKeyStoreWithKey() {
  const fakeKey = {} as CryptoKey
  vi.doMock('../lib/encryption-key-store', () => ({
    encryptionKeyStore: {
      getKey: () => fakeKey,
      isReady: () => true,
      requireKey: () => fakeKey,
      requireKeyMap: () => ({ v1: fakeKey }),
    },
  }))
}

beforeEach(() => {
  vi.resetModules()
})

describe('AC 1 — plaintext is never stored at rest', () => {
  it('holds the payload in memory (nothing in IndexedDB) when encryptPayload throws mid-call', async () => {
    const auditPhiAccess = mockAudit()
    mockKeyStoreWithKey()
    vi.doMock('@ultranos/crypto', () => ({
      encryptPayload: vi.fn().mockRejectedValue(new Error('SubtleCrypto unavailable')),
      decryptPayload: vi.fn(),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { db } = await import('../lib/db')
      await db.syncQueue.clear()
      const { syncQueue, getHeldForEncryptionCount } = await import('../lib/sync-queue')

      await expect(syncQueue.enqueue({ ...baseInput })).resolves.toBeUndefined()

      // NOTHING persisted — especially not plaintext.
      const rows = await db.syncQueue.toArray()
      expect(rows).toHaveLength(0)
      expect(getHeldForEncryptionCount()).toBe(1)

      // Audit failure event emitted (opaque ids only).
      expect(auditPhiAccess).toHaveBeenCalledWith(
        'SYNC',
        'AllergyIntolerance',
        baseInput.resourceId,
        undefined,
        expect.objectContaining({ syncOutcome: 'failure', reason: 'encrypt_failed', held: true }),
      )
      // No PHI in any console output.
      for (const call of warnSpy.mock.calls) {
        expect(String(call[0])).not.toContain('PLAINTEXT-PHI-MARKER')
      }
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('holds the payload in memory when the session key is unavailable', async () => {
    const auditPhiAccess = mockAudit()
    vi.doMock('../lib/encryption-key-store', () => ({
      encryptionKeyStore: {
        getKey: () => null,
        isReady: () => false,
        requireKey: () => { throw new Error('no key') },
        requireKeyMap: () => { throw new Error('no key') },
      },
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { db } = await import('../lib/db')
      await db.syncQueue.clear()
      const { syncQueue, getHeldForEncryptionCount } = await import('../lib/sync-queue')

      await expect(syncQueue.enqueue({ ...baseInput })).resolves.toBeUndefined()

      expect(await db.syncQueue.toArray()).toHaveLength(0)
      expect(getHeldForEncryptionCount()).toBe(1)
      expect(auditPhiAccess).toHaveBeenCalledWith(
        'SYNC',
        'AllergyIntolerance',
        baseInput.resourceId,
        undefined,
        expect.objectContaining({ syncOutcome: 'failure', reason: 'key_unavailable', held: true }),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('flushHeldEnqueues encrypts + enqueues held payloads once the key works again', async () => {
    mockAudit()
    mockKeyStoreWithKey()
    // First call fails (key revoked mid-call), subsequent calls succeed.
    const encryptPayload = vi.fn()
      .mockRejectedValueOnce(new Error('key revoked mid-call'))
      .mockResolvedValue('v1:ENCRYPTED_BASE64')
    vi.doMock('@ultranos/crypto', () => ({ encryptPayload, decryptPayload: vi.fn() }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { db } = await import('../lib/db')
      await db.syncQueue.clear()
      const { syncQueue, flushHeldEnqueues, getHeldForEncryptionCount } =
        await import('../lib/sync-queue')

      await syncQueue.enqueue({ ...baseInput })
      expect(getHeldForEncryptionCount()).toBe(1)
      expect(await db.syncQueue.toArray()).toHaveLength(0)

      await flushHeldEnqueues()

      expect(getHeldForEncryptionCount()).toBe(0)
      const rows = await db.syncQueue.toArray()
      expect(rows).toHaveLength(1)
      // Stored encrypted — never the plaintext marker.
      expect(rows[0]!.payload).toBe('enc:v1:ENCRYPTED_BASE64')
      expect(rows[0]!.payload).not.toContain('PLAINTEXT-PHI-MARKER')
      expect(rows[0]!.status).toBe('pending')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('regression: with a working key, enqueue stores an encrypted pending entry (happy path unchanged)', async () => {
    mockAudit()
    mockKeyStoreWithKey()
    vi.doMock('@ultranos/crypto', () => ({
      encryptPayload: vi.fn().mockResolvedValue('v1:HAPPYPATH'),
      decryptPayload: vi.fn(),
    }))

    const { db } = await import('../lib/db')
    await db.syncQueue.clear()
    const { syncQueue, getHeldForEncryptionCount } = await import('../lib/sync-queue')

    await syncQueue.enqueue({ ...baseInput })

    const rows = await db.syncQueue.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload).toBe('enc:v1:HAPPYPATH')
    expect(rows[0]!.status).toBe('pending')
    expect(getHeldForEncryptionCount()).toBe(0)
  })
})

describe('AC 2 — storage failures surface to UI + audit (QuotaExceededError)', () => {
  it('sets STORAGE_QUOTA_EXCEEDED sync error and audits the failure, then rethrows', async () => {
    const auditPhiAccess = mockAudit()
    mockKeyStoreWithKey()
    vi.doMock('@ultranos/crypto', () => ({
      encryptPayload: vi.fn().mockResolvedValue('v1:CIPHER'),
      decryptPayload: vi.fn(),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { db } = await import('../lib/db')
      await db.syncQueue.clear()
      const quotaError = new DOMException('quota exceeded', 'QuotaExceededError')
      const putSpy = vi.spyOn(db.syncQueue, 'put').mockRejectedValue(quotaError)

      const { syncQueue } = await import('../lib/sync-queue')
      const { useSyncStore } = await import('../stores/sync-store')

      await expect(syncQueue.enqueue({ ...baseInput })).rejects.toThrow()

      expect(useSyncStore.getState().syncError).toBe('STORAGE_QUOTA_EXCEEDED')
      expect(auditPhiAccess).toHaveBeenCalledWith(
        'SYNC',
        'AllergyIntolerance',
        baseInput.resourceId,
        undefined,
        expect.objectContaining({
          syncOutcome: 'failure',
          reason: 'enqueue_failed',
          errorName: 'QuotaExceededError',
        }),
      )

      putSpy.mockRestore()
      useSyncStore.getState().setSyncError(null)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('sets SYNC_ENQUEUE_FAILED for a non-quota storage error', async () => {
    const auditPhiAccess = mockAudit()
    mockKeyStoreWithKey()
    vi.doMock('@ultranos/crypto', () => ({
      encryptPayload: vi.fn().mockResolvedValue('v1:CIPHER'),
      decryptPayload: vi.fn(),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { db } = await import('../lib/db')
      await db.syncQueue.clear()
      const putSpy = vi.spyOn(db.syncQueue, 'put').mockRejectedValue(new Error('IDB corrupted'))

      const { syncQueue } = await import('../lib/sync-queue')
      const { useSyncStore } = await import('../stores/sync-store')

      await expect(syncQueue.enqueue({ ...baseInput })).rejects.toThrow()

      expect(useSyncStore.getState().syncError).toBe('SYNC_ENQUEUE_FAILED')
      expect(auditPhiAccess).toHaveBeenCalledWith(
        'SYNC',
        'AllergyIntolerance',
        baseInput.resourceId,
        undefined,
        expect.objectContaining({ syncOutcome: 'failure', reason: 'enqueue_failed' }),
      )

      putSpy.mockRestore()
      useSyncStore.getState().setSyncError(null)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('enqueueSyncAction still never throws upstream after the proxy surfaces + rethrows', async () => {
    mockAudit()
    mockKeyStoreWithKey()
    vi.doMock('@ultranos/crypto', () => ({
      encryptPayload: vi.fn().mockResolvedValue('v1:CIPHER'),
      decryptPayload: vi.fn(),
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const { db } = await import('../lib/db')
      await db.syncQueue.clear()
      const putSpy = vi.spyOn(db.syncQueue, 'put').mockRejectedValue(
        new DOMException('quota exceeded', 'QuotaExceededError'),
      )

      const { syncQueue } = await import('../lib/sync-queue')
      const { enqueueSyncAction } = await import('@ultranos/sync-engine')

      // Store-layer contract: clinical workflows are never blocked.
      await expect(
        enqueueSyncAction(syncQueue, {
          resourceType: baseInput.resourceType,
          resourceId: baseInput.resourceId,
          action: baseInput.action,
          payload: { substance: 'x' },
          hlcTimestamp: VALID_HLC,
        }),
      ).resolves.toBeUndefined()

      putSpy.mockRestore()
      const { useSyncStore } = await import('../stores/sync-store')
      useSyncStore.getState().setSyncError(null)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

/**
 * Story 60.2 — Sync-Engine Fail-Safe Hardening.
 *
 * Covers the closed fail-open fallbacks:
 * - AC 2: enqueueSyncAction surfaces failures via onEnqueueError (never only console.warn)
 * - AC 3: drain worker with NO onConflict handler terminal-fails (never fake-synced)
 * - AC 4: unknown resource types default to TIER_2 (covered in conflict-tiers.test.ts too)
 * - AC 6: dedup preserves 'create' semantics when merged with an 'update'
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSyncQueue, type SyncQueueEntry, type SyncQueueStorage } from '../queue.js'
import { enqueueSyncAction } from '../enqueue.js'
import { DrainWorker, type SyncResult } from '../drain-worker.js'
import { getConflictTier } from '../conflict-tiers.js'

function createInMemoryStorage(): SyncQueueStorage {
  let entries: SyncQueueEntry[] = []

  return {
    async put(entry: SyncQueueEntry) {
      const idx = entries.findIndex((e) => e.id === entry.id)
      if (idx >= 0) {
        entries[idx] = entry
      } else {
        entries.push(entry)
      }
    },
    async getByResourceId(resourceId: string, status: string) {
      return entries.find(
        (e) => e.resourceId === resourceId && e.status === status,
      ) ?? null
    },
    async getByStatus(status: string) {
      return entries.filter((e) => e.status === status)
    },
    async delete(id: string) {
      entries = entries.filter((e) => e.id !== id)
    },
    async count(status: string) {
      return entries.filter((e) => e.status === status).length
    },
    async getLatestSynced() {
      const synced = entries
        .filter((e) => e.status === 'synced')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return synced[0] ?? null
    },
  }
}

const HLC = '000001700000000:00000:node-1'

describe('AC 2 — enqueue failure surfacing', () => {
  it('invokes onEnqueueError with resource identifiers and the error NAME (no payload contents)', async () => {
    const failingQueue = {
      enqueue: vi.fn().mockRejectedValue(
        new DOMException('Quota exceeded', 'QuotaExceededError'),
      ),
    } as unknown as ReturnType<typeof createSyncQueue>

    const onEnqueueError = vi.fn()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await enqueueSyncAction(
        failingQueue,
        {
          resourceType: 'Observation',
          resourceId: 'obs-1',
          action: 'create',
          payload: { secret: 'PHI-CONTENT' },
          hlcTimestamp: HLC,
        },
        undefined,
        { onEnqueueError },
      )

      expect(onEnqueueError).toHaveBeenCalledOnce()
      const info = onEnqueueError.mock.calls[0]![0]
      expect(info.resourceType).toBe('Observation')
      expect(info.resourceId).toBe('obs-1')
      expect(info.action).toBe('create')
      expect(info.errorName).toBe('QuotaExceededError')
      // No payload contents in the hook info (besides the raw error object).
      expect(JSON.stringify({ ...info, error: undefined })).not.toContain('PHI-CONTENT')

      // Console warn still fires and names the error type — never PHI.
      expect(warnSpy).toHaveBeenCalled()
      expect(String(warnSpy.mock.calls[0]![0])).toContain('QuotaExceededError')
      expect(String(warnSpy.mock.calls[0]![0])).not.toContain('PHI-CONTENT')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('never throws, even when both the enqueue and the hook throw', async () => {
    const failingQueue = {
      enqueue: vi.fn().mockRejectedValue(new Error('DB exploded')),
    } as unknown as ReturnType<typeof createSyncQueue>
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await expect(
        enqueueSyncAction(
          failingQueue,
          {
            resourceType: 'Observation',
            resourceId: 'obs-1',
            action: 'update',
            payload: {},
            hlcTimestamp: HLC,
          },
          undefined,
          {
            onEnqueueError: () => {
              throw new Error('hook exploded')
            },
          },
        ),
      ).resolves.toBeUndefined()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('AC 3 — conflict with no onConflict handler is never fake-synced', () => {
  let storage: SyncQueueStorage
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  it('terminal-fails the entry (status failed, CONFLICT_UNHANDLED reason) instead of marking synced', async () => {
    await queue.enqueue({
      resourceType: 'AllergyIntolerance',
      resourceId: 'allergy-1',
      action: 'update',
      payload: '{"id":"allergy-1","criticality":"high"}',
      hlcTimestamp: HLC,
    })

    const syncFn = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>().mockResolvedValue({
      success: false,
      conflict: {
        remoteVersion: {
          id: 'allergy-1',
          data: { id: 'allergy-1', criticality: 'low' },
          hlcTimestamp: { wallMs: 1700000001, counter: 0, nodeId: 'node-2' },
          version: '000001700000001:00000:node-2',
        },
      },
    })

    const audits: Array<[string, string]> = []
    // NO onConflict configured — the fail-open being closed.
    const worker = new DrainWorker({
      queue,
      syncFn,
      onAudit: (entry, outcome) => audits.push([entry.resourceId, outcome]),
    })
    await worker.drain()

    const synced = await storage.getByStatus('synced')
    const failed = await storage.getByStatus('failed')
    const pending = await storage.getByStatus('pending')

    expect(synced).toHaveLength(0) // never fake-synced
    expect(pending).toHaveLength(0) // terminal — no pointless retry loop
    expect(failed).toHaveLength(1)
    expect(failed[0]!.failureReason).toContain('CONFLICT_UNHANDLED')

    // Both the conflict and the resulting failure were audited.
    expect(audits).toContainEqual(['allergy-1', 'conflict'])
    expect(audits).toContainEqual(['allergy-1', 'failure'])
  })

  it('still resolves + marks synced when an onConflict handler IS configured (no regression)', async () => {
    await queue.enqueue({
      resourceType: 'Patient',
      resourceId: 'pat-1',
      action: 'update',
      payload: '{"id":"pat-1","name":"local"}',
      hlcTimestamp: HLC,
    })

    const syncFn = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>().mockResolvedValue({
      success: false,
      conflict: {
        remoteVersion: {
          id: 'pat-1',
          data: { id: 'pat-1', name: 'remote' },
          hlcTimestamp: { wallMs: 1700000001, counter: 0, nodeId: 'node-2' },
          version: '000001700000001:00000:node-2',
        },
      },
    })

    const onConflict = vi.fn().mockResolvedValue(undefined)
    const worker = new DrainWorker({ queue, syncFn, onConflict })
    await worker.drain()

    expect(onConflict).toHaveBeenCalledOnce()
    expect(await storage.getByStatus('synced')).toHaveLength(1)
    expect(await storage.getByStatus('failed')).toHaveLength(0)
  })
})

describe('AC 4 — unknown-type tier default', () => {
  it('defaults an unmapped type to TIER_2, never TIER_3 LWW', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(getConflictTier('SomeFutureResource')).toBe('TIER_2')
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('AC 6 — dedup preserves create semantics', () => {
  let storage: SyncQueueStorage
  let queue: ReturnType<typeof createSyncQueue>

  beforeEach(() => {
    storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
  })

  async function enqueuePair(first: 'create' | 'update' | 'delete', second: 'create' | 'update' | 'delete') {
    await queue.enqueue({
      resourceType: 'Observation',
      resourceId: 'obs-1',
      action: first,
      payload: '{"version":1}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })
    await queue.enqueue({
      resourceType: 'Observation',
      resourceId: 'obs-1',
      action: second,
      payload: '{"version":2}',
      hlcTimestamp: '000001700000001:00000:node-1',
    })
    const pending = await storage.getByStatus('pending')
    expect(pending).toHaveLength(1)
    return pending[0]!
  }

  it('create + update → create (newer payload, create action preserved)', async () => {
    const merged = await enqueuePair('create', 'update')
    expect(merged.action).toBe('create')
    expect(merged.payload).toBe('{"version":2}')
    expect(merged.hlcTimestamp).toBe('000001700000001:00000:node-1')
  })

  it('update + update → update (unchanged behavior)', async () => {
    const merged = await enqueuePair('update', 'update')
    expect(merged.action).toBe('update')
  })

  it('create + delete → delete (a delete must never be downgraded)', async () => {
    const merged = await enqueuePair('create', 'delete')
    expect(merged.action).toBe('delete')
  })
})

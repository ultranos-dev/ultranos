import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DrainWorker, type SyncResult } from '../drain-worker.js'
import { createSyncQueue, type SyncQueueEntry, type SyncQueueStorage } from '../queue.js'
import type { ConflictResolution } from '../conflict-resolver.js'

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

describe('DrainWorker', () => {
  let queue: ReturnType<typeof createSyncQueue>
  let syncFn: ReturnType<typeof vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>>

  beforeEach(() => {
    const storage = createInMemoryStorage()
    queue = createSyncQueue(storage)
    syncFn = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>()
  })

  it('drains pending items and marks them synced on success', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn })
    await worker.drain()

    const pending = await queue.getPending()
    expect(pending).toHaveLength(0)
    expect(syncFn).toHaveBeenCalledOnce()
  })

  it('marks items as failed when syncFn returns failure', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    syncFn.mockResolvedValue({ success: false, error: 'network error' })

    const worker = new DrainWorker({ queue, syncFn })
    await worker.drain()

    // Entry is still pending (retry count incremented, in backoff)
    const counts = await queue.getCounts()
    expect(counts.pendingCount).toBe(1)
    expect(counts.failedCount).toBe(0)
  })

  it('marks items as failed when syncFn throws', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    syncFn.mockRejectedValue(new Error('fetch failed'))

    const worker = new DrainWorker({ queue, syncFn })
    await worker.drain()

    const counts = await queue.getCounts()
    expect(counts.pendingCount).toBe(1)
  })

  it('calls onStatusUpdate after drain cycle', async () => {
    const onStatusUpdate = vi.fn()

    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, onStatusUpdate })
    await worker.drain()

    expect(onStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        isPending: false,
        isError: false,
        pendingCount: 0,
        failedCount: 0,
      }),
    )
  })

  it('calls onAudit for each sync operation', async () => {
    const onAudit = vi.fn()

    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, onAudit })
    await worker.drain()

    expect(onAudit).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'enc-1' }),
      'success',
    )
  })

  it('processes items in sync priority order', async () => {
    const processedOrder: string[] = []

    await queue.enqueue({
      resourceType: 'Patient',
      resourceId: 'pat-1',
      action: 'update',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    await queue.enqueue({
      resourceType: 'AllergyIntolerance',
      resourceId: 'allergy-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000001:00000:node-1',
    })

    syncFn.mockImplementation(async (entry: SyncQueueEntry) => {
      processedOrder.push(entry.resourceType)
      return { success: true }
    })

    const worker = new DrainWorker({ queue, syncFn })
    await worker.drain()

    expect(processedOrder).toEqual(['AllergyIntolerance', 'Patient'])
  })

  it('calls onConflict with resolution when Hub returns 409', async () => {
    await queue.enqueue({
      resourceType: 'Patient',
      resourceId: 'pat-1',
      action: 'update',
      payload: '{"id":"pat-1","name":"local"}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    const onConflict = vi.fn<(entry: SyncQueueEntry, resolution: ConflictResolution) => Promise<void>>()
      .mockResolvedValue(undefined)

    syncFn.mockResolvedValue({
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

    const worker = new DrainWorker({ queue, syncFn, onConflict })
    await worker.drain()

    expect(onConflict).toHaveBeenCalledOnce()
    const resolution = onConflict.mock.calls[0]![1]
    // Patient is Tier 3 → LWW strategy
    expect(resolution.strategy).toBe('LWW')
  })

  it('does not run concurrent drains', async () => {
    await queue.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    let resolveSync: ((v: SyncResult) => void) | null = null
    const syncStarted = new Promise<void>((resolve) => {
      syncFn.mockImplementation(() => {
        return new Promise<SyncResult>((r) => {
          resolveSync = r
          resolve() // signal that syncFn was entered
        })
      })
    })

    const worker = new DrainWorker({ queue, syncFn })
    const drain1 = worker.drain()

    // Wait for the first sync to actually start
    await syncStarted
    const drain2 = worker.drain() // Should be a no-op since draining flag is set

    // Resolve the first sync
    resolveSync!({ success: true })
    await drain1
    await drain2

    // syncFn should only be called once (second drain was skipped)
    expect(syncFn).toHaveBeenCalledOnce()
  })
})

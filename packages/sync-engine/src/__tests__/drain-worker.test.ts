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

  it('persists failureReason from syncFn error string', async () => {
    const storage = createInMemoryStorage()
    const q = createSyncQueue(storage, 1) // maxRetries=1 so first failure is permanent

    await q.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    const sf = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>()
      .mockResolvedValue({ success: false, error: 'HTTP 502' })

    const worker = new DrainWorker({ queue: q, syncFn: sf })
    await worker.drain()

    const failed = await storage.getByStatus('failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]!.failureReason).toBe('HTTP 502')
  })

  it('persists failureReason when syncFn throws', async () => {
    const storage = createInMemoryStorage()
    const q = createSyncQueue(storage, 1) // maxRetries=1

    await q.enqueue({
      resourceType: 'Encounter',
      resourceId: 'enc-1',
      action: 'create',
      payload: '{}',
      hlcTimestamp: '000001700000000:00000:node-1',
    })

    const sf = vi.fn<(entry: SyncQueueEntry) => Promise<SyncResult>>()
      .mockRejectedValue(new Error('network timeout'))

    const worker = new DrainWorker({ queue: q, syncFn: sf })
    await worker.drain()

    const failed = await storage.getByStatus('failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]!.failureReason).toBe('network timeout')
  })

  it('reports a successful sync outcome to the ConnectivityManager', async () => {
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    const recordSpy = vi.spyOn(cm, 'recordResult')

    await queue.enqueue({
      resourceType: 'Encounter', resourceId: 'enc-1', action: 'create',
      payload: '{}', hlcTimestamp: '000001700000000:00000:node-1',
    })
    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, connectivity: cm })
    await worker.drain()

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })

  it('reports a failed sync outcome to the ConnectivityManager', async () => {
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    const recordSpy = vi.spyOn(cm, 'recordResult')

    await queue.enqueue({
      resourceType: 'Encounter', resourceId: 'enc-1', action: 'create',
      payload: '{}', hlcTimestamp: '000001700000000:00000:node-1',
    })
    syncFn.mockRejectedValue(new Error('network down'))

    const worker = new DrainWorker({ queue, syncFn, connectivity: cm })
    await worker.drain()

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ ok: false }))
  })

  it('requestDrain debounces multiple calls into a single drain', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    await queue.enqueue({ resourceType: 'Observation', resourceId: 'o1', action: 'create', payload: '{}', hlcTimestamp: '000001700000000:00000:node-1' })
    syncFn.mockResolvedValue({ success: true })

    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, enqueueDebounceMs: 300 })
    const drainSpy = vi.spyOn(worker, 'drain')

    worker.requestDrain()
    worker.requestDrain()
    worker.requestDrain()
    expect(drainSpy).not.toHaveBeenCalled() // debounced

    await vi.advanceTimersByTimeAsync(300)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('requestDrain({ immediate: true }) drains without waiting for the debounce', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, enqueueDebounceMs: 300 })
    const drainSpy = vi.spyOn(worker, 'drain')

    worker.requestDrain({ immediate: true })
    await Promise.resolve()
    expect(drainSpy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('requestDrain is a no-op when connectivity is offline', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => false })
    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, enqueueDebounceMs: 300 })
    const drainSpy = vi.spyOn(worker, 'drain')

    worker.requestDrain()
    worker.requestDrain({ immediate: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(drainSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('polls on the healthy interval when connectivity is healthy', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({
      queue, syncFn, connectivity: cm,
      intervals: { healthyMs: 15000, degradedMs: 60000 },
      jitterRatio: 0, // deterministic
    })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    drainSpy.mockClear() // ignore the immediate start() drain

    await vi.advanceTimersByTimeAsync(15000)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    worker.stop()
    vi.useRealTimers()
  })

  it('backs off to the degraded interval when connectivity is degraded', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true, failureAlpha: 1, degradedFailureRate: 0.3 })
    cm.recordResult({ ok: false }) // force degraded
    expect(cm.getState()).toBe('degraded')
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({
      queue, syncFn, connectivity: cm,
      intervals: { healthyMs: 15000, degradedMs: 60000 }, jitterRatio: 0,
    })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    drainSpy.mockClear()

    await vi.advanceTimersByTimeAsync(15000)
    expect(drainSpy).not.toHaveBeenCalled() // not yet — degraded waits 60s
    await vi.advanceTimersByTimeAsync(45000)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    worker.stop()
    vi.useRealTimers()
  })

  it('does not reschedule a poll while offline', async () => {
    vi.useFakeTimers()
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => false })
    const worker = new DrainWorker({ queue, syncFn, connectivity: cm, intervals: { healthyMs: 15000, degradedMs: 60000 }, jitterRatio: 0 })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    await vi.advanceTimersByTimeAsync(120000)
    expect(drainSpy).not.toHaveBeenCalled() // offline: start() drain gated + no reschedule
    worker.stop()
    vi.useRealTimers()
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

  it('sends pending entries via syncBatchFn in one call and marks them synced', async () => {
    for (const id of ['a', 'b', 'c']) {
      await queue.enqueue({ resourceType: 'Observation', resourceId: id, action: 'create', payload: '{}', hlcTimestamp: `00000170000000${id.charCodeAt(0)}:00000:node-1` })
    }
    const syncBatchFn = vi.fn(async (entries: SyncQueueEntry[]) => {
      const m = new Map<string, SyncResult>()
      for (const e of entries) m.set(e.resourceId, { success: true })
      return m
    })
    const worker = new DrainWorker({ queue, syncFn, syncBatchFn, batchSize: 50 })
    await worker.drain()

    expect(syncBatchFn).toHaveBeenCalledOnce()
    expect(syncBatchFn.mock.calls[0][0]).toHaveLength(3)
    expect(await queue.getCounts()).toEqual({ pendingCount: 0, failedCount: 0 })
    expect(syncFn).not.toHaveBeenCalled() // batch path preferred
  })

  it('respects batchSize by chunking', async () => {
    for (let i = 0; i < 5; i++) {
      await queue.enqueue({ resourceType: 'Observation', resourceId: `r${i}`, action: 'create', payload: '{}', hlcTimestamp: `00000170000000${i}:00000:node-1` })
    }
    const syncBatchFn = vi.fn(async (entries: SyncQueueEntry[]) => {
      const m = new Map<string, SyncResult>()
      for (const e of entries) m.set(e.resourceId, { success: true })
      return m
    })
    const worker = new DrainWorker({ queue, syncFn, syncBatchFn, batchSize: 2 })
    await worker.drain()
    expect(syncBatchFn).toHaveBeenCalledTimes(3) // 2 + 2 + 1
  })

  it('marks an entry failed when the batch result omits it', async () => {
    await queue.enqueue({ resourceType: 'Observation', resourceId: 'x', action: 'create', payload: '{}', hlcTimestamp: '000001700000000:00000:node-1' })
    const syncBatchFn = vi.fn(async () => new Map<string, SyncResult>()) // empty — no result for 'x'
    const worker = new DrainWorker({ queue, syncFn, syncBatchFn })
    await worker.drain()
    expect((await queue.getCounts()).pendingCount).toBe(1) // retried (retryCount incremented, in backoff)
  })

  it('batch path: reports ok:false to ConnectivityManager when all entries in chunk fail', async () => {
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    const recordSpy = vi.spyOn(cm, 'recordResult')

    for (const id of ['b1', 'b2']) {
      await queue.enqueue({ resourceType: 'Observation', resourceId: id, action: 'create', payload: '{}', hlcTimestamp: `000001700000000:00000:node-1` })
    }
    const syncBatchFn = vi.fn(async (entries: SyncQueueEntry[]) => {
      const m = new Map<string, SyncResult>()
      for (const e of entries) m.set(e.resourceId, { success: false, error: 'HTTP 503' })
      return m
    })

    const worker = new DrainWorker({ queue, syncFn, syncBatchFn, connectivity: cm })
    await worker.drain()

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ ok: false, latencyMs: expect.any(Number) }))
  })

  it('batch path: reports ok:true to ConnectivityManager when at least one entry succeeds', async () => {
    const { ConnectivityManager } = await import('../connectivity-manager.js')
    const cm = new ConnectivityManager({ isOnline: () => true })
    const recordSpy = vi.spyOn(cm, 'recordResult')

    for (const id of ['c1', 'c2']) {
      await queue.enqueue({ resourceType: 'Observation', resourceId: id, action: 'create', payload: '{}', hlcTimestamp: `000001700000000:00000:node-1` })
    }
    const syncBatchFn = vi.fn(async (entries: SyncQueueEntry[]) => {
      const m = new Map<string, SyncResult>()
      m.set(entries[0]!.resourceId, { success: true })
      m.set(entries[1]!.resourceId, { success: false, error: 'HTTP 500' })
      return m
    })

    const worker = new DrainWorker({ queue, syncFn, syncBatchFn, connectivity: cm })
    await worker.drain()

    expect(recordSpy).toHaveBeenCalledWith(expect.objectContaining({ ok: true, latencyMs: expect.any(Number) }))
  })

  it('bare worker (no connectivity, no intervals) polls on pollIntervalMs', async () => {
    // Node.js 22+ exposes navigator but navigator.onLine is undefined (not a browser).
    // Stub it so isOnline() returns true and scheduleNext() sets the timer.
    const origOnLine = (global as Record<string, unknown>).navigator
    Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true })

    vi.useFakeTimers()
    syncFn.mockResolvedValue({ success: true })
    const worker = new DrainWorker({ queue, syncFn, pollIntervalMs: 30000, jitterRatio: 0 })
    const drainSpy = vi.spyOn(worker, 'drain')
    worker.start()
    drainSpy.mockClear() // ignore the immediate start() drain

    await vi.advanceTimersByTimeAsync(30000)
    expect(drainSpy).toHaveBeenCalledTimes(1)
    worker.stop()
    vi.useRealTimers()

    // Restore navigator
    Object.defineProperty(global, 'navigator', { value: origOnLine, configurable: true })
  })
})

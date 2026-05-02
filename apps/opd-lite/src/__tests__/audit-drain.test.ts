import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuditDrainWorker, type DrainableAuditStore, type AuditSyncFn, type AuditSyncResult } from '@ultranos/audit-logger/drain'
import { UserRole, AuditAction, AuditResourceType } from '@ultranos/shared-types'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'

function makeEvent(overrides?: Partial<ClientAuditEvent>): ClientAuditEvent {
  return {
    id: crypto.randomUUID(),
    actorId: 'user-001',
    actorRole: UserRole.DOCTOR,
    action: AuditAction.READ,
    resourceType: AuditResourceType.PATIENT,
    resourceId: 'patient-001',
    hlcTimestamp: '000001234567890:00000:node1',
    queuedAt: new Date().toISOString(),
    status: 'pending',
    ...overrides,
  }
}

function createMockStore(events: ClientAuditEvent[]): DrainableAuditStore {
  return {
    getPending: vi.fn(async (limit: number) => {
      const pending = events.filter((e) => e.status === 'pending').slice(0, limit)
      return pending
    }),
    markSynced: vi.fn(async (ids: string[]) => {
      for (const id of ids) {
        const e = events.find((ev) => ev.id === id)
        if (e) e.status = 'synced'
      }
    }),
    markFailed: vi.fn(async (ids: string[]) => {
      for (const id of ids) {
        const e = events.find((ev) => ev.id === id)
        if (e) e.status = 'failed'
      }
    }),
  }
}

describe('AuditDrainWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('drains all pending events on successful sync', async () => {
    const events = [makeEvent(), makeEvent(), makeEvent()]
    const store = createMockStore(events)
    const syncFn: AuditSyncFn = vi.fn(async (batch) =>
      batch.map((e) => ({ id: e.id, success: true })),
    )

    const worker = new AuditDrainWorker({ store, syncFn })
    await worker.drain()

    expect(syncFn).toHaveBeenCalledTimes(1)
    expect(store.markSynced).toHaveBeenCalled()
    expect(events.every((e) => e.status === 'synced')).toBe(true)
  })

  it('marks events as failed after max retries on network error', async () => {
    const events = [makeEvent()]
    const store = createMockStore(events)
    const syncFn: AuditSyncFn = vi.fn(async () => {
      throw new Error('Network error')
    })

    const worker = new AuditDrainWorker({ store, syncFn })

    // Run drain with fake timers to handle backoff
    const drainPromise = worker.drain()

    // Advance through all retry delays (1s, 4s)
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(4000)
    await drainPromise

    expect(syncFn).toHaveBeenCalledTimes(3) // Initial + 2 retries
    expect(store.markFailed).toHaveBeenCalled()
    expect(events[0].status).toBe('failed')
  })

  it('handles partial success — synced events removed from retry', async () => {
    const e1 = makeEvent()
    const e2 = makeEvent()
    const events = [e1, e2]
    const store = createMockStore(events)

    let callCount = 0
    const syncFn: AuditSyncFn = vi.fn(async (batch): Promise<AuditSyncResult[]> => {
      callCount++
      if (callCount === 1) {
        // First call: e1 succeeds, e2 fails
        return batch.map((e) => ({
          id: e.id,
          success: e.id === e1.id,
        }))
      }
      // Subsequent calls: all succeed
      return batch.map((e) => ({ id: e.id, success: true }))
    })

    const worker = new AuditDrainWorker({ store, syncFn })
    const drainPromise = worker.drain()

    // Advance through retry delay
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(4000)
    await vi.advanceTimersByTimeAsync(16000)
    await drainPromise

    expect(e1.status).toBe('synced')
  })

  it('does not drain concurrently', async () => {
    const events = [makeEvent()]
    const store = createMockStore(events)
    const syncFn: AuditSyncFn = vi.fn(async (batch) => {
      // Slow sync
      await new Promise((r) => setTimeout(r, 100))
      return batch.map((e) => ({ id: e.id, success: true }))
    })

    const worker = new AuditDrainWorker({ store, syncFn })

    // Start two drains concurrently
    const p1 = worker.drain()
    const p2 = worker.drain()

    await vi.advanceTimersByTimeAsync(200)
    await Promise.all([p1, p2])

    // syncFn should only be called once because the second drain was blocked
    expect(syncFn).toHaveBeenCalledTimes(1)
  })
})

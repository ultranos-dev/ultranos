/**
 * Story 51.4 — Equipment Booking & Scheduling
 * Unit tests for equipment-service.ts
 *
 * AC covered:
 * AC 1: Instrument registration and retrieval, out-of-service rejects batches
 * AC 2: Batch queuing assigns correct position
 * AC 3: Estimated time calculation
 * AC 4: Batch completion promotes next batch and creates notification
 * AC 5: Queue reordering updates positions
 * AC 6: Batch lifecycle — start, complete, history, avg run time update
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  registerInstrument,
  updateInstrument,
  setInstrumentStatus,
  getInstruments,
  getInstrumentById,
  queueBatch,
  startBatch,
  completeBatch,
  cancelBatch,
  reorderQueue,
  computeQueueTimes,
  getActiveInstrumentNotifications,
} from '../lib/equipment-service'
import type { Instrument, QueuedBatch, InstrumentHistoryEntry, InstrumentNotification } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockInstruments: Instrument[] = []
const mockQueue: QueuedBatch[] = []
const mockHistory: InstrumentHistoryEntry[] = []
const mockNotifications: InstrumentNotification[] = []

function makeDbTable<T extends { id: string }>(store: T[]) {
  return {
    add: async (record: T) => { store.push(record); return record.id },
    put: async (record: T) => {
      const idx = store.findIndex((r) => r.id === record.id)
      if (idx >= 0) store[idx] = record
      else store.push(record)
    },
    get: async (id: string) => store.find((r) => r.id === id),
    update: async (id: string, changes: Partial<T>) => {
      const idx = store.findIndex((r) => r.id === id)
      if (idx >= 0) Object.assign(store[idx], changes)
    },
    toArray: async () => [...store],
    where: (key: string) => ({
      equals: (val: any) => ({
        filter: (fn: (item: T) => boolean) => ({
          toArray: async () => store.filter((r) => (r as any)[key] === val).filter(fn),
          first: async () => store.filter((r) => (r as any)[key] === val).filter(fn)[0],
          count: async () => store.filter((r) => (r as any)[key] === val).filter(fn).length,
        }),
        toArray: async () => store.filter((r) => (r as any)[key] === val),
        first: async () => store.find((r) => (r as any)[key] === val),
      }),
      between: (_lower: any, _upper: any) => ({
        filter: (fn: (item: T) => boolean) => ({
          toArray: async () => store.filter(fn),
          first: async () => store.filter(fn)[0],
          sortBy: async (_key: string) => {
            const filtered = store.filter(fn)
            return filtered.sort((a, b) => {
              const av = (a as any)[_key] ?? 0
              const bv = (b as any)[_key] ?? 0
              return av < bv ? -1 : av > bv ? 1 : 0
            })
          },
        }),
        filter: (fn: (item: T) => boolean) => ({
          toArray: async () => store.filter(fn),
          equals: (val: any) => ({
            filter: (fn2: (item: T) => boolean) => ({
              first: async () => store.filter(fn).filter(fn2)[0],
            }),
          }),
          first: async () => store.filter(fn)[0],
          sortBy: async (_key: string) => store.filter(fn),
        }),
        toArray: async () => [...store],
        equals: (val: any) => ({
          filter: (fn: (item: T) => boolean) => ({
            first: async () => store.filter(fn)[0],
          }),
          first: async () => store[0],
        }),
        first: async () => store[0],
      }),
      reverse: () => ({
        sortBy: async (key: string) => {
          const arr = store.filter((r) => true)
          return arr.sort((a, b) => {
            const av = (a as any)[key] ?? ''
            const bv = (b as any)[key] ?? ''
            return bv.localeCompare(av)
          })
        },
      }),
    }),
    filter: (fn: (item: T) => boolean) => ({
      toArray: async () => store.filter(fn),
    }),
    count: async () => store.length,
    clear: async () => { store.length = 0 },
  }
}

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getDb: () => ({
      instruments: makeDbTable(mockInstruments),
      instrument_queue: makeDbTable(mockQueue),
      instrument_history: makeDbTable(mockHistory),
      instrument_notifications: makeDbTable(mockNotifications),
      transaction: async (_mode: string, _tables: any[], fn: () => Promise<void>) => {
        await fn()
      },
    }),
  }
})

vi.mock('../lib/audit-client', () => ({
  emitEquipmentAuditEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstrument(overrides: Partial<Instrument> = {}): Omit<Instrument, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: 'CBC Analyzer',
    type: 'Hematology Analyzer',
    model: 'Sysmex XN-1000',
    serialNumber: 'SN-12345',
    avgRunTimeMinutes: 15,
    status: 'IN_SERVICE',
    outOfServiceReason: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockInstruments.length = 0
  mockQueue.length = 0
  mockHistory.length = 0
  mockNotifications.length = 0
})

// ---------------------------------------------------------------------------
// AC 1: Instrument Registry
// ---------------------------------------------------------------------------

describe('Instrument Registry (AC 1)', () => {
  it('registers an instrument and retrieves it', async () => {
    const id = await registerInstrument(makeInstrument())
    const instruments = await getInstruments()
    expect(instruments).toHaveLength(1)
    expect(instruments[0].id).toBe(id)
    expect(instruments[0].name).toBe('CBC Analyzer')
    expect(instruments[0].status).toBe('IN_SERVICE')
  })

  it('sets instrument to out of service', async () => {
    const id = await registerInstrument(makeInstrument())
    await setInstrumentStatus(id, 'OUT_OF_SERVICE', 'Calibration required')
    const inst = await getInstrumentById(id)
    expect(inst?.status).toBe('OUT_OF_SERVICE')
    expect(inst?.outOfServiceReason).toBe('Calibration required')
  })

  it('clears out-of-service reason when set back in service', async () => {
    const id = await registerInstrument(makeInstrument({ status: 'OUT_OF_SERVICE', outOfServiceReason: 'Broken' }))
    await setInstrumentStatus(id, 'IN_SERVICE')
    const inst = await getInstrumentById(id)
    expect(inst?.outOfServiceReason).toBeNull()
  })

  it('updates instrument model', async () => {
    const id = await registerInstrument(makeInstrument())
    await updateInstrument(id, { model: 'Sysmex XN-3000' })
    const inst = await getInstrumentById(id)
    expect(inst?.model).toBe('Sysmex XN-3000')
  })
})

// ---------------------------------------------------------------------------
// AC 2: Batch Queue — Queuing and Positions
// ---------------------------------------------------------------------------

describe('Batch Queue (AC 2)', () => {
  it('assigns position 1 to the first batch', async () => {
    const id = await registerInstrument(makeInstrument())
    const batch = await queueBatch(id, {
      techId: 'tech-1',
      techName: 'Alice',
      sampleIds: [],
      sampleCount: 3,
      testType: 'CBC',
    })
    expect(batch.position).toBe(1)
    expect(batch.status).toBe('QUEUED')
  })

  it('assigns sequential positions for multiple batches', async () => {
    const id = await registerInstrument(makeInstrument())
    const b1 = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 2, testType: 'CBC' })
    const b2 = await queueBatch(id, { techId: 'tech-2', techName: 'Bob', sampleIds: [], sampleCount: 1, testType: 'BMP' })
    const b3 = await queueBatch(id, { techId: 'tech-3', techName: 'Carol', sampleIds: [], sampleCount: 4, testType: 'UA' })
    expect(b1.position).toBe(1)
    expect(b2.position).toBe(2)
    expect(b3.position).toBe(3)
  })

  it('rejects queuing on an out-of-service instrument', async () => {
    const id = await registerInstrument(makeInstrument({ status: 'OUT_OF_SERVICE' }))
    await expect(
      queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    ).rejects.toThrow('out of service')
  })

  it('uses instrument avg run time when no override provided', async () => {
    const id = await registerInstrument(makeInstrument({ avgRunTimeMinutes: 20 }))
    const batch = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    expect(batch.estimatedRunMinutes).toBe(20)
  })

  it('uses the override run time when provided', async () => {
    const id = await registerInstrument(makeInstrument({ avgRunTimeMinutes: 20 }))
    const batch = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC', estimatedRunMinutes: 10 })
    expect(batch.estimatedRunMinutes).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// AC 3: Estimated Time Calculator
// ---------------------------------------------------------------------------

describe('computeQueueTimes (AC 3)', () => {
  const instrument: Instrument = {
    id: 'inst-1',
    name: 'CBC',
    type: 'Hematology Analyzer',
    model: 'X',
    serialNumber: null,
    avgRunTimeMinutes: 15,
    status: 'IN_SERVICE',
    outOfServiceReason: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  function makeBatch(position: number, runMinutes: number, status: QueuedBatch['status'] = 'QUEUED'): QueuedBatch {
    return {
      id: `batch-${position}`,
      instrumentId: 'inst-1',
      techId: `tech-${position}`,
      techName: `Tech ${position}`,
      sampleIds: [],
      sampleCount: 1,
      testType: 'CBC',
      estimatedRunMinutes: runMinutes,
      position,
      status,
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    }
  }

  it('first QUEUED batch starts approximately now', () => {
    const queue = [makeBatch(1, 10)]
    const result = computeQueueTimes(queue, instrument)
    const now = new Date()
    const diff = Math.abs(result[0].estimatedStartTime!.getTime() - now.getTime())
    expect(diff).toBeLessThan(5000) // within 5 seconds of now
  })

  it('subsequent batches start after previous completion', () => {
    const queue = [makeBatch(1, 10), makeBatch(2, 20), makeBatch(3, 15)]
    const result = computeQueueTimes(queue, instrument)
    expect(result[1].estimatedStartTime!.getTime()).toBe(result[0].estimatedCompletionTime!.getTime())
    expect(result[2].estimatedStartTime!.getTime()).toBe(result[1].estimatedCompletionTime!.getTime())
  })

  it('RUNNING batch uses startedAt as start time', () => {
    const started = new Date(Date.now() - 5 * 60_000) // 5 min ago
    const batch = { ...makeBatch(1, 10, 'RUNNING'), startedAt: started.toISOString() }
    const result = computeQueueTimes([batch], instrument)
    expect(result[0].estimatedStartTime!.getTime()).toBe(started.getTime())
  })

  it('completion time = start time + run minutes', () => {
    const queue = [makeBatch(1, 30)]
    const result = computeQueueTimes(queue, instrument)
    const expectedMs = result[0].estimatedStartTime!.getTime() + 30 * 60_000
    expect(result[0].estimatedCompletionTime!.getTime()).toBe(expectedMs)
  })
})

// ---------------------------------------------------------------------------
// AC 6: Batch Lifecycle
// ---------------------------------------------------------------------------

describe('Batch Lifecycle (AC 6)', () => {
  it('prevents starting a batch not in position 1', async () => {
    const id = await registerInstrument(makeInstrument())
    await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    const b2 = await queueBatch(id, { techId: 'tech-2', techName: 'Bob', sampleIds: [], sampleCount: 1, testType: 'BMP' })
    await expect(startBatch(b2.id)).rejects.toThrow('first batch')
  })

  it('starts the position-1 batch', async () => {
    const id = await registerInstrument(makeInstrument())
    const b1 = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    await startBatch(b1.id)
    const updated = mockQueue.find((b) => b.id === b1.id)
    expect(updated?.status).toBe('RUNNING')
    expect(updated?.startedAt).not.toBeNull()
  })

  it('completes a running batch and promotes the next one', async () => {
    const id = await registerInstrument(makeInstrument())
    const b1 = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    const b2 = await queueBatch(id, { techId: 'tech-2', techName: 'Bob', sampleIds: [], sampleCount: 1, testType: 'BMP' })

    // Simulate b1 running
    await startBatch(b1.id)
    await completeBatch(b1.id)

    const b1Updated = mockQueue.find((b) => b.id === b1.id)
    const b2Updated = mockQueue.find((b) => b.id === b2.id)

    expect(b1Updated?.status).toBe('COMPLETED')
    expect(b2Updated?.position).toBe(1)
  })

  it('writes a history entry on batch completion', async () => {
    const id = await registerInstrument(makeInstrument())
    const b1 = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    await startBatch(b1.id)
    await completeBatch(b1.id)
    expect(mockHistory).toHaveLength(1)
    expect(mockHistory[0].instrumentId).toBe(id)
    expect(mockHistory[0].batchId).toBe(b1.id)
  })

  it('creates next-in-line notification after completion', async () => {
    const id = await registerInstrument(makeInstrument())
    const b1 = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    const b2 = await queueBatch(id, { techId: 'tech-2', techName: 'Bob', sampleIds: [], sampleCount: 1, testType: 'BMP' })

    await startBatch(b1.id)
    await completeBatch(b1.id)

    const notifs = await getActiveInstrumentNotifications('tech-2')
    expect(notifs.length).toBeGreaterThanOrEqual(1)
    expect(notifs[0].batchId).toBe(b2.id)
  })

  it('cancels a batch and reorders remaining queue', async () => {
    const id = await registerInstrument(makeInstrument())
    await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    const b2 = await queueBatch(id, { techId: 'tech-2', techName: 'Bob', sampleIds: [], sampleCount: 1, testType: 'BMP' })
    const b3 = await queueBatch(id, { techId: 'tech-3', techName: 'Carol', sampleIds: [], sampleCount: 1, testType: 'UA' })

    await cancelBatch(b2.id, 'No longer needed')

    const b2Updated = mockQueue.find((b) => b.id === b2.id)
    const b3Updated = mockQueue.find((b) => b.id === b3.id)
    expect(b2Updated?.status).toBe('CANCELLED')
    expect(b3Updated?.position).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// AC 5: Queue Reordering
// ---------------------------------------------------------------------------

describe('Queue Reordering (AC 5)', () => {
  it('reorders queue and updates positions', async () => {
    const id = await registerInstrument(makeInstrument())
    const b1 = await queueBatch(id, { techId: 'tech-1', techName: 'Alice', sampleIds: [], sampleCount: 1, testType: 'CBC' })
    const b2 = await queueBatch(id, { techId: 'tech-2', techName: 'Bob', sampleIds: [], sampleCount: 1, testType: 'BMP' })
    const b3 = await queueBatch(id, { techId: 'tech-3', techName: 'Carol', sampleIds: [], sampleCount: 1, testType: 'UA' })

    // Reorder: b3 first, b1 second, b2 third
    await reorderQueue(id, [b3.id, b1.id, b2.id], 'manager-1')

    expect(mockQueue.find((b) => b.id === b3.id)?.position).toBe(1)
    expect(mockQueue.find((b) => b.id === b1.id)?.position).toBe(2)
    expect(mockQueue.find((b) => b.id === b2.id)?.position).toBe(3)
  })
})

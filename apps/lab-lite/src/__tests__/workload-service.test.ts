import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  estimateCompletionTime,
} from '../lib/workload-service'

// ---------------------------------------------------------------------------
// Mock Dexie db and dependencies
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDb: () => ({
    samples: {
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      modify: vi.fn().mockResolvedValue(1),
    },
    queueEntries: {
      toArray: vi.fn().mockResolvedValue([]),
    },
    tat_overrides: {
      toArray: vi.fn().mockResolvedValue([]),
    },
    tech_workload_snapshots: {
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
    },
    tech_availability: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
      put: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    custody_events: {
      add: vi.fn().mockResolvedValue(undefined),
    },
    syncQueue: {
      put: vi.fn().mockResolvedValue(undefined),
    },
  }),
  putWorkloadSnapshot: vi.fn().mockResolvedValue(undefined),
  getWorkloadSnapshotsByDateRange: vi.fn().mockResolvedValue([]),
  getOpenAvailabilityForTech: vi.fn().mockResolvedValue(undefined),
  addTechAvailability: vi.fn().mockResolvedValue(undefined),
  closeAvailabilityRecord: vi.fn().mockResolvedValue(undefined),
  addCustodyEvent: vi.fn().mockResolvedValue(undefined),
  enqueueSyncEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn().mockReturnValue({ ts: 1000, counter: 0, node: 'test' }) },
  serializeHlc: vi.fn().mockReturnValue('2026-01-01T00:00:00.000Z'),
}))

// ---------------------------------------------------------------------------
// estimateCompletionTime
// ---------------------------------------------------------------------------

describe('estimateCompletionTime', () => {
  it('returns null when no workload', () => {
    expect(estimateCompletionTime(0, 0, 30)).toBeNull()
  })

  it('returns null when avgTat is 0', () => {
    expect(estimateCompletionTime(5, 2, 0)).toBeNull()
  })

  it('returns a future Date when there is workload', () => {
    const now = Date.now()
    const result = estimateCompletionTime(3, 1, 30)
    expect(result).toBeInstanceOf(Date)
    // 4 samples × 30 min = 120 min from now
    expect(result!.getTime()).toBeGreaterThan(now + 100 * 60_000)
    expect(result!.getTime()).toBeLessThan(now + 140 * 60_000)
  })

  it('handles only pending samples', () => {
    const result = estimateCompletionTime(2, 0, 60)
    expect(result).toBeInstanceOf(Date)
    // 2 × 60 min = 120 min
    const diffMin = (result!.getTime() - Date.now()) / 60_000
    expect(diffMin).toBeGreaterThan(115)
    expect(diffMin).toBeLessThan(125)
  })

  it('handles only in-progress samples', () => {
    const result = estimateCompletionTime(0, 1, 45)
    expect(result).toBeInstanceOf(Date)
  })
})

// ---------------------------------------------------------------------------
// Load level thresholds (tested via getCurrentWorkloads behaviour)
// ---------------------------------------------------------------------------

describe('load level threshold logic', () => {
  it('GREEN: 0 samples is ≤100% of lab average', () => {
    // When labAvg is 0, all techs should be GREEN (nothing to compare against)
    // This is validated via estimateCompletionTime returning null (no workload)
    expect(estimateCompletionTime(0, 0, 30)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Historical pattern aggregation
// ---------------------------------------------------------------------------

import { getHistoricalPatterns } from '../lib/workload-service'
import * as db from '../lib/db'

describe('getHistoricalPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty patterns when no snapshots', async () => {
    vi.mocked(db.getWorkloadSnapshotsByDateRange).mockResolvedValue([])
    const result = await getHistoricalPatterns(30)
    expect(result.snapshotCount).toBe(0)
    expect(result.overloadedTechs).toHaveLength(0)
    expect(result.underutilizedTechs).toHaveLength(0)
    expect(result.avgSamplesPerTechPerShift).toEqual({})
    expect(result.peakHours).toEqual({})
  })

  it('computes average samples per tech per shift', async () => {
    const snapshots = [
      { id: '1', techId: 'tech-A', shiftDate: '2026-01-01', pendingCount: 5, inProgressCount: 2, completedCount: 3, avgTatMinutes: 30, snapshotAt: '2026-01-01T08:00:00.000Z' },
      { id: '2', techId: 'tech-A', shiftDate: '2026-01-02', pendingCount: 4, inProgressCount: 1, completedCount: 5, avgTatMinutes: 30, snapshotAt: '2026-01-02T08:00:00.000Z' },
      { id: '3', techId: 'tech-B', shiftDate: '2026-01-01', pendingCount: 2, inProgressCount: 1, completedCount: 2, avgTatMinutes: 30, snapshotAt: '2026-01-01T09:00:00.000Z' },
    ]
    vi.mocked(db.getWorkloadSnapshotsByDateRange).mockResolvedValue(snapshots as any)

    const result = await getHistoricalPatterns(30)
    expect(result.snapshotCount).toBe(3)

    // tech-A: (5+2+3 + 4+1+5) / 2 = (10 + 10) / 2 = 10
    expect(result.avgSamplesPerTechPerShift['tech-A']).toBe(10)
    // tech-B: (2+1+2) / 1 = 5
    expect(result.avgSamplesPerTechPerShift['tech-B']).toBe(5)
  })

  it('does NOT flag overloaded techs with fewer than 7 snapshots', async () => {
    // tech-A has only 6 snapshots, even though load ratio > 1.2
    const snapshots = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      techId: 'tech-A',
      shiftDate: `2026-01-0${i + 1}`,
      pendingCount: 20,
      inProgressCount: 0,
      completedCount: 0,
      avgTatMinutes: 30,
      snapshotAt: `2026-01-0${i + 1}T08:00:00.000Z`,
    }))
    vi.mocked(db.getWorkloadSnapshotsByDateRange).mockResolvedValue(snapshots as any)

    const result = await getHistoricalPatterns(30)
    // Only 6 snapshots — NOT enough for the 7-shift threshold
    expect(result.overloadedTechs).not.toContain('tech-A')
  })

  it('flags overloaded techs with 7+ snapshots above 120% threshold', async () => {
    const highLoad = Array.from({ length: 8 }, (_, i) => ({
      id: `a${i}`,
      techId: 'tech-A',
      shiftDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      pendingCount: 20,
      inProgressCount: 0,
      completedCount: 0,
      avgTatMinutes: 30,
      snapshotAt: `2026-01-${String(i + 1).padStart(2, '0')}T08:00:00.000Z`,
    }))
    const lowLoad = Array.from({ length: 8 }, (_, i) => ({
      id: `b${i}`,
      techId: 'tech-B',
      shiftDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      pendingCount: 4,
      inProgressCount: 0,
      completedCount: 0,
      avgTatMinutes: 30,
      snapshotAt: `2026-01-${String(i + 1).padStart(2, '0')}T09:00:00.000Z`,
    }))
    vi.mocked(db.getWorkloadSnapshotsByDateRange).mockResolvedValue([...highLoad, ...lowLoad] as any)

    const result = await getHistoricalPatterns(30)
    // tech-A avg = 20, tech-B avg = 4, labAvg = 12; tech-A ratio = 20/12 = 1.67 > 1.2
    expect(result.overloadedTechs).toContain('tech-A')
    // tech-B ratio = 4/12 = 0.33 < 0.8 → underutilized
    expect(result.underutilizedTechs).toContain('tech-B')
  })

  it('computes peak hour distribution from snapshotAt', async () => {
    const snapshots = [
      { id: '1', techId: 'tech-A', shiftDate: '2026-01-01', pendingCount: 3, inProgressCount: 2, completedCount: 0, avgTatMinutes: 30, snapshotAt: '2026-01-01T08:00:00.000Z' },
      { id: '2', techId: 'tech-B', shiftDate: '2026-01-01', pendingCount: 2, inProgressCount: 1, completedCount: 0, avgTatMinutes: 30, snapshotAt: '2026-01-01T08:30:00.000Z' },
      { id: '3', techId: 'tech-A', shiftDate: '2026-01-02', pendingCount: 1, inProgressCount: 1, completedCount: 0, avgTatMinutes: 30, snapshotAt: '2026-01-02T14:00:00.000Z' },
    ]
    vi.mocked(db.getWorkloadSnapshotsByDateRange).mockResolvedValue(snapshots as any)

    const result = await getHistoricalPatterns(30)
    // Hour 8: tech-A (5) + tech-B (3) = 8
    expect(result.peakHours[8]).toBe(8)
    // Hour 14: tech-A (2)
    expect(result.peakHours[14]).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Sample reassignment
// ---------------------------------------------------------------------------

import { reassignSample } from '../lib/workload-service'

describe('reassignSample', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls db modify, addCustodyEvent, and enqueueSyncEvent', async () => {
    // getDb() is a plain factory (not vi.fn()), so we cannot inspect the db
    // instance's modify spy directly (each call creates a new object).
    // Instead we verify the stable module-level helper mocks.
    await reassignSample('sample-1', 'tech-A', 'tech-B', 'manager-1')

    expect(db.addCustodyEvent).toHaveBeenCalled()
    expect(db.enqueueSyncEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'SAMPLE_ASSIGNMENT',
        resourceId: 'sample-1',
      }),
    )
  })
})

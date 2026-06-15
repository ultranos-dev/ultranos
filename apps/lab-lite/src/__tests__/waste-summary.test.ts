import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, putWasteContainer, addDisposalRecord } from '../lib/db'
import {
  ContainerType,
  ContainerStatus,
  DisposalMethod,
  FillLevel,
} from '@/types/waste-tracking'
import type { WasteContainer, WasteDisposalRecord } from '@/types/waste-tracking'

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'hlc-test-timestamp',
}))

function makeDisposalRecord(
  overrides: Partial<WasteDisposalRecord> = {},
): WasteDisposalRecord {
  return {
    id: crypto.randomUUID(),
    containerId: crypto.randomUUID(),
    type: ContainerType.SHARPS,
    disposedBy: 'tech-1',
    disposedAt: '2026-05-15T10:00:00.000Z',
    disposalMethod: DisposalMethod.AUTOCLAVE,
    quantityEstimate: '1 container',
    location: 'Station 1',
    hlcTimestamp: 'hlc-test',
    ...overrides,
  }
}

describe('Waste Summary', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.waste_containers.clear()
    await db.waste_disposal_records.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.waste_containers.clear()
    await db.waste_disposal_records.clear()
  })

  it('generates correct aggregation by type and location', async () => {
    // Add disposal records for May 2026
    await addDisposalRecord(
      makeDisposalRecord({
        type: ContainerType.SHARPS,
        location: 'Station 1',
        disposedAt: '2026-05-10T10:00:00.000Z',
      }),
    )
    await addDisposalRecord(
      makeDisposalRecord({
        type: ContainerType.SHARPS,
        location: 'Station 2',
        disposedAt: '2026-05-12T10:00:00.000Z',
      }),
    )
    await addDisposalRecord(
      makeDisposalRecord({
        type: ContainerType.INFECTIOUS,
        location: 'Station 1',
        disposedAt: '2026-05-20T10:00:00.000Z',
      }),
    )

    const { generateMonthlySummary } = await import(
      '../lib/safety/waste-summary'
    )
    const summary = await generateMonthlySummary(2026, 5)

    expect(summary.period).toBe('2026-05')
    expect(summary.totalContainersDisposed).toBe(3)
    expect(summary.byType[ContainerType.SHARPS]).toBe(2)
    expect(summary.byType[ContainerType.INFECTIOUS]).toBe(1)
    expect(summary.byType[ContainerType.CHEMICAL]).toBe(0)
    expect(summary.byLocation['Station 1']).toBe(2)
    expect(summary.byLocation['Station 2']).toBe(1)
  })

  it('handles months with no disposals', async () => {
    const { generateMonthlySummary } = await import(
      '../lib/safety/waste-summary'
    )
    const summary = await generateMonthlySummary(2026, 1)

    expect(summary.totalContainersDisposed).toBe(0)
    expect(summary.byType[ContainerType.SHARPS]).toBe(0)
    expect(summary.complianceNotes).toContain(
      'No disposal records for this period.',
    )
  })

  it('calculates average fill days by type from disposed containers', async () => {
    // Add disposed containers with known fill times, both disposed within May 2026
    const makeDisposed = (
      type: ContainerType,
      startIso: string,
      fillDays: number,
    ) => {
      const startMs = new Date(startIso).getTime()
      const fillDateIso = new Date(startMs + fillDays * 86400000).toISOString()
      return {
        id: crypto.randomUUID(),
        location: 'Station 1',
        type,
        status: ContainerStatus.DISPOSED as ContainerStatus,
        startDate: startIso,
        expectedFillDate: null,
        fillDate: fillDateIso,
        fillLevel: FillLevel.FULL as FillLevel,
        fillHistory: [],
        disposedBy: 'tech-1',
        disposedAt: fillDateIso,
        disposalMethod: DisposalMethod.AUTOCLAVE as DisposalMethod,
        quantityEstimate: '1',
        hlcTimestamp: 'hlc-test',
      }
    }

    // Container 1: started Apr 25, filled in 10 days -> disposed May 5
    await putWasteContainer(makeDisposed(ContainerType.SHARPS, '2026-04-25T10:00:00.000Z', 10))
    // Container 2: started May 1, filled in 14 days -> disposed May 15
    await putWasteContainer(makeDisposed(ContainerType.SHARPS, '2026-05-01T10:00:00.000Z', 14))

    const { generateMonthlySummary } = await import(
      '../lib/safety/waste-summary'
    )
    const summary = await generateMonthlySummary(2026, 5)

    expect(summary.averageFillDaysByType[ContainerType.SHARPS]).toBe(12) // (10+14)/2
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  putWasteContainer,
  getActiveContainers,
  getContainerHistory,
  getAllContainers,
  getWasteContainerById,
  addDisposalRecord,
  getDisposalRecords,
} from '../lib/db'
import {
  ContainerType,
  ContainerStatus,
  FillLevel,
  DisposalMethod,
} from '@/types/waste-tracking'
import type { WasteContainer } from '@/types/waste-tracking'

// Mock audit client so service imports don't fail
vi.mock('@/lib/audit-client', () => ({
  reportWasteEvent: vi.fn(),
}))

// Mock hlc so tests don't depend on real clock
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'hlc-test-timestamp',
}))

function makeContainer(
  overrides: Partial<WasteContainer> = {},
): WasteContainer {
  return {
    id: crypto.randomUUID(),
    location: 'Station 1',
    type: ContainerType.SHARPS,
    status: ContainerStatus.ACTIVE,
    startDate: new Date().toISOString(),
    expectedFillDate: null,
    fillDate: null,
    fillLevel: FillLevel.QUARTER,
    fillHistory: [],
    disposedBy: null,
    disposedAt: null,
    disposalMethod: null,
    quantityEstimate: null,
    hlcTimestamp: 'hlc-test',
    ...overrides,
  }
}

describe('Waste Tracking DB Helpers', () => {
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

  it('puts and retrieves a waste container', async () => {
    const container = makeContainer()
    await putWasteContainer(container)

    const retrieved = await getWasteContainerById(container.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.location).toBe('Station 1')
    expect(retrieved!.type).toBe(ContainerType.SHARPS)
  })

  it('getActiveContainers returns only active containers', async () => {
    const active = makeContainer({ status: ContainerStatus.ACTIVE })
    const disposed = makeContainer({ status: ContainerStatus.DISPOSED })
    await putWasteContainer(active)
    await putWasteContainer(disposed)

    const result = await getActiveContainers()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(active.id)
  })

  it('getContainerHistory returns disposed containers for location+type', async () => {
    const disposed1 = makeContainer({
      location: 'Station 1',
      type: ContainerType.SHARPS,
      status: ContainerStatus.DISPOSED,
      fillDate: new Date().toISOString(),
    })
    const disposed2 = makeContainer({
      location: 'Station 1',
      type: ContainerType.INFECTIOUS,
      status: ContainerStatus.DISPOSED,
      fillDate: new Date().toISOString(),
    })
    const active = makeContainer({
      location: 'Station 1',
      type: ContainerType.SHARPS,
      status: ContainerStatus.ACTIVE,
    })
    await putWasteContainer(disposed1)
    await putWasteContainer(disposed2)
    await putWasteContainer(active)

    const history = await getContainerHistory('Station 1', ContainerType.SHARPS)
    expect(history).toHaveLength(1)
    expect(history[0].id).toBe(disposed1.id)
  })

  it('getAllContainers returns all containers', async () => {
    await putWasteContainer(makeContainer())
    await putWasteContainer(makeContainer({ status: ContainerStatus.DISPOSED }))

    const all = await getAllContainers()
    expect(all).toHaveLength(2)
  })

  it('adds and retrieves disposal records', async () => {
    const record = {
      id: crypto.randomUUID(),
      containerId: 'container-1',
      type: ContainerType.SHARPS,
      disposedBy: 'tech-1',
      disposedAt: new Date().toISOString(),
      disposalMethod: DisposalMethod.AUTOCLAVE,
      quantityEstimate: '1 container',
      location: 'Station 1',
      hlcTimestamp: 'hlc-test',
    }

    await addDisposalRecord(record)
    const records = await getDisposalRecords()
    expect(records).toHaveLength(1)
    expect(records[0].containerId).toBe('container-1')
  })
})

describe('Waste Tracking Service', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.waste_containers.clear()
    await db.waste_disposal_records.clear()
    await db.syncQueue.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.waste_containers.clear()
    await db.waste_disposal_records.clear()
    await db.syncQueue.clear()
  })

  it('calculateAverageFillDays returns default when no history', async () => {
    const { calculateAverageFillDays } = await import(
      '../lib/safety/waste-tracking-service'
    )
    const avg = await calculateAverageFillDays('Station 1', ContainerType.SHARPS)
    expect(avg).toBe(14) // default for SHARPS
  })

  it('calculateAverageFillDays computes from historical data', async () => {
    // Create 3 disposed containers with known fill times
    const base = new Date('2026-01-01').getTime()
    for (let i = 0; i < 3; i++) {
      const startDate = new Date(base + i * 30 * 86400000).toISOString()
      const fillDate = new Date(
        base + i * 30 * 86400000 + (10 + i * 2) * 86400000,
      ).toISOString() // 10, 12, 14 days
      await putWasteContainer(
        makeContainer({
          location: 'Station 2',
          type: ContainerType.SHARPS,
          status: ContainerStatus.DISPOSED,
          startDate,
          fillDate,
        }),
      )
    }

    const { calculateAverageFillDays } = await import(
      '../lib/safety/waste-tracking-service'
    )
    const avg = await calculateAverageFillDays(
      'Station 2',
      ContainerType.SHARPS,
    )
    expect(avg).toBe(12) // (10+12+14)/3 = 12
  })

  it('activateContainer creates an active container with sync event', async () => {
    const { activateContainer } = await import(
      '../lib/safety/waste-tracking-service'
    )
    const container = await activateContainer({
      location: 'Hematology Bench',
      type: ContainerType.INFECTIOUS,
    })

    expect(container.status).toBe(ContainerStatus.ACTIVE)
    expect(container.location).toBe('Hematology Bench')
    expect(container.type).toBe(ContainerType.INFECTIOUS)
    expect(container.fillLevel).toBe(FillLevel.QUARTER)
    expect(container.expectedFillDate).toBeDefined()
    expect(container.fillHistory).toHaveLength(0)

    // Verify persisted
    const retrieved = await getWasteContainerById(container.id)
    expect(retrieved).toBeDefined()

    // Verify sync event was queued
    const db = getDb()
    const syncEvents = await db.syncQueue.toArray()
    expect(syncEvents.length).toBeGreaterThanOrEqual(1)
    expect(syncEvents.some((e: any) => e.resourceType === 'WasteContainer')).toBe(true)
  })

  it('updateFillLevel appends to fill history', async () => {
    const container = makeContainer()
    await putWasteContainer(container)

    const { updateFillLevel } = await import(
      '../lib/safety/waste-tracking-service'
    )
    await updateFillLevel(container.id, FillLevel.HALF, 'tech-1')

    const updated = await getWasteContainerById(container.id)
    expect(updated!.fillLevel).toBe(FillLevel.HALF)
    expect(updated!.fillHistory).toHaveLength(1)
    expect(updated!.fillHistory[0].level).toBe(FillLevel.HALF)
    expect(updated!.fillHistory[0].recordedBy).toBe('tech-1')
  })

  it('updateFillLevel to FULL sets status to FULL and fillDate', async () => {
    const container = makeContainer()
    await putWasteContainer(container)

    const { updateFillLevel } = await import(
      '../lib/safety/waste-tracking-service'
    )
    await updateFillLevel(container.id, FillLevel.FULL, 'tech-1')

    const updated = await getWasteContainerById(container.id)
    expect(updated!.status).toBe(ContainerStatus.FULL)
    expect(updated!.fillDate).not.toBeNull()
  })

  it('disposeContainer sets correct status and creates disposal record', async () => {
    const container = makeContainer({
      status: ContainerStatus.FULL,
      fillDate: new Date().toISOString(),
    })
    await putWasteContainer(container)

    const { disposeContainer } = await import(
      '../lib/safety/waste-tracking-service'
    )
    await disposeContainer(container.id, {
      disposedBy: 'tech-1',
      disposalMethod: DisposalMethod.INCINERATION,
      quantityEstimate: '1 full sharps container',
    })

    const updated = await getWasteContainerById(container.id)
    expect(updated!.status).toBe(ContainerStatus.DISPOSED)
    expect(updated!.disposedBy).toBe('tech-1')
    expect(updated!.disposalMethod).toBe(DisposalMethod.INCINERATION)

    const records = await getDisposalRecords()
    expect(records).toHaveLength(1)
    expect(records[0].containerId).toBe(container.id)
    expect(records[0].disposalMethod).toBe(DisposalMethod.INCINERATION)
  })

  it('updateFillLevel throws for non-existent container', async () => {
    const { updateFillLevel } = await import(
      '../lib/safety/waste-tracking-service'
    )
    await expect(
      updateFillLevel('non-existent-id', FillLevel.HALF, 'tech-1'),
    ).rejects.toThrow('Container non-existent-id not found')
  })
})

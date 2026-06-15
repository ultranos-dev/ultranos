import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, putWasteContainer } from '../lib/db'
import {
  ContainerType,
  ContainerStatus,
  FillLevel,
} from '@/types/waste-tracking'
import type { WasteContainer } from '@/types/waste-tracking'

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

describe('Waste Alerts', () => {
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

  it('fires alert at 75% fill level', async () => {
    const container = makeContainer({
      fillLevel: FillLevel.THREE_QUARTER,
    })
    await putWasteContainer(container)

    const { checkWasteAlerts } = await import('../lib/safety/waste-alerts')
    const alerts = await checkWasteAlerts()

    const fillAlerts = alerts.filter(
      (a) =>
        a.containerId === container.id &&
        a.message.includes('75%'),
    )
    expect(fillAlerts.length).toBeGreaterThanOrEqual(1)
    expect(fillAlerts[0].severity).toBe('WARNING')
  })

  it('fires URGENT alert at FULL fill level', async () => {
    const container = makeContainer({
      fillLevel: FillLevel.FULL,
    })
    await putWasteContainer(container)

    const { checkWasteAlerts } = await import('../lib/safety/waste-alerts')
    const alerts = await checkWasteAlerts()

    const fillAlerts = alerts.filter(
      (a) =>
        a.containerId === container.id &&
        a.message.includes('100%'),
    )
    expect(fillAlerts.length).toBeGreaterThanOrEqual(1)
    expect(fillAlerts[0].severity).toBe('URGENT')
  })

  it('fires alert at 80% of average fill time', async () => {
    // No history, so default for SHARPS is 14 days. 80% = 11.2 days.
    // Container started 12 days ago -> should alert.
    const twelveDaysAgo = new Date(
      Date.now() - 12 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const container = makeContainer({
      startDate: twelveDaysAgo,
    })
    await putWasteContainer(container)

    const { checkWasteAlerts } = await import('../lib/safety/waste-alerts')
    const alerts = await checkWasteAlerts()

    const timeAlerts = alerts.filter(
      (a) =>
        a.containerId === container.id &&
        a.message.includes('average fill time'),
    )
    expect(timeAlerts.length).toBeGreaterThanOrEqual(1)
  })

  it('does not fire time-based alert for recently started containers', async () => {
    // Container started 2 days ago. Default SHARPS = 14 days, 80% = 11.2 days.
    const twoDaysAgo = new Date(
      Date.now() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const container = makeContainer({
      startDate: twoDaysAgo,
    })
    await putWasteContainer(container)

    const { checkWasteAlerts } = await import('../lib/safety/waste-alerts')
    const alerts = await checkWasteAlerts()

    const timeAlerts = alerts.filter(
      (a) =>
        a.containerId === container.id &&
        a.message.includes('average fill time'),
    )
    expect(timeAlerts).toHaveLength(0)
  })

  it('fires alert when container not checked in 48+ hours', async () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString()

    const container = makeContainer({
      startDate: threeDaysAgo,
      fillHistory: [
        {
          level: FillLevel.QUARTER,
          recordedAt: threeDaysAgo,
          recordedBy: 'tech-1',
        },
      ],
    })
    await putWasteContainer(container)

    const { checkWasteAlerts } = await import('../lib/safety/waste-alerts')
    const alerts = await checkWasteAlerts()

    const staleAlerts = alerts.filter(
      (a) =>
        a.containerId === container.id &&
        a.message.includes('has not been checked'),
    )
    expect(staleAlerts.length).toBeGreaterThanOrEqual(1)
    expect(staleAlerts[0].severity).toBe('WARNING')
  })

  it('does not alert for disposed containers', async () => {
    const container = makeContainer({
      status: ContainerStatus.DISPOSED,
      fillLevel: FillLevel.FULL,
    })
    await putWasteContainer(container)

    const { checkWasteAlerts } = await import('../lib/safety/waste-alerts')
    const alerts = await checkWasteAlerts()

    const containerAlerts = alerts.filter(
      (a) => a.containerId === container.id,
    )
    expect(containerAlerts).toHaveLength(0)
  })
})

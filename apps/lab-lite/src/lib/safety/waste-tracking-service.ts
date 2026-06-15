import {
  ContainerType,
  ContainerStatus,
  FillLevel,
  DisposalMethod,
} from '@/types/waste-tracking'
import type { WasteContainer, WasteDisposalRecord } from '@/types/waste-tracking'
import {
  getDb,
  putWasteContainer,
  getContainerHistory,
  getWasteContainerById,
  addDisposalRecord,
  getActiveContainers,
  enqueueSyncEvent,
} from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { reportWasteEvent } from '@/lib/audit-client'

/** Ordinal values for fill level comparison (prevents regression). */
const FILL_LEVEL_ORDER: Record<FillLevel, number> = {
  [FillLevel.QUARTER]: 1,
  [FillLevel.HALF]: 2,
  [FillLevel.THREE_QUARTER]: 3,
  [FillLevel.FULL]: 4,
}

/** Default fill days when no history is available (per container type). */
const DEFAULT_FILL_DAYS: Record<ContainerType, number> = {
  [ContainerType.SHARPS]: 14,
  [ContainerType.INFECTIOUS]: 7,
  [ContainerType.CHEMICAL]: 30,
}

/** Calculate average fill days for containers at a given location and type. */
export async function calculateAverageFillDays(
  location: string,
  type: ContainerType,
): Promise<number> {
  const disposed = await getContainerHistory(location, type)
  const withFillDate = disposed.filter((c) => c.fillDate !== null)

  if (withFillDate.length === 0) {
    return DEFAULT_FILL_DAYS[type]
  }

  const totalDays = withFillDate.reduce((sum, c) => {
    const start = new Date(c.startDate).getTime()
    const end = new Date(c.fillDate!).getTime()
    const days = (end - start) / (1000 * 60 * 60 * 24)
    return sum + Math.max(days, 0)
  }, 0)

  const avg = Math.round(totalDays / withFillDate.length)
  return avg > 0 ? avg : DEFAULT_FILL_DAYS[type]
}

/** Get active containers approaching full based on fill rate averages. */
export async function getContainersNearingFull(): Promise<
  Array<WasteContainer & { avgFillDays: number; daysActive: number }>
> {
  const active = await getActiveContainers()
  const results: Array<WasteContainer & { avgFillDays: number; daysActive: number }> = []

  for (const container of active) {
    const avgFillDays = await calculateAverageFillDays(container.location, container.type)
    const daysActive = Math.floor(
      (Date.now() - new Date(container.startDate).getTime()) / (1000 * 60 * 60 * 24),
    )

    if (daysActive >= avgFillDays * 0.8) {
      results.push({ ...container, avgFillDays, daysActive })
    }
  }

  return results
}

/** Activate a new waste container at a location. */
export async function activateContainer(input: {
  location: string
  type: ContainerType
}): Promise<WasteContainer> {
  const now = new Date().toISOString()
  const avgFillDays = await calculateAverageFillDays(input.location, input.type)
  const expectedFillDate = new Date(
    Date.now() + avgFillDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  const container: WasteContainer = {
    id: crypto.randomUUID(),
    location: input.location,
    type: input.type,
    status: ContainerStatus.ACTIVE,
    startDate: now,
    expectedFillDate,
    fillDate: null,
    fillLevel: FillLevel.QUARTER,
    fillHistory: [],
    disposedBy: null,
    disposedAt: null,
    disposalMethod: null,
    quantityEstimate: null,
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  const db = getDb()
  await db.transaction('rw', [db.waste_containers, db.syncQueue], async () => {
    await putWasteContainer(container)
    await enqueueSyncEvent({
      resourceType: 'WasteContainer',
      resourceId: container.id,
      payload: container,
      hlcTimestamp: container.hlcTimestamp,
    })
  })
  reportWasteEvent({
    action: 'WASTE_CONTAINER_ACTIVATED',
    containerId: container.id,
    location: container.location,
    containerType: container.type,
  })
  return container
}

/** Update the fill level of a container and append to fill history. */
export async function updateFillLevel(
  containerId: string,
  level: FillLevel,
  techId: string,
): Promise<void> {
  const container = await getWasteContainerById(containerId)
  if (!container) {
    throw new Error(`Container ${containerId} not found`)
  }
  if (container.status !== ContainerStatus.ACTIVE) {
    throw new Error(`Container ${containerId} is ${container.status}, not ACTIVE`)
  }
  if (FILL_LEVEL_ORDER[level] < FILL_LEVEL_ORDER[container.fillLevel]) {
    throw new Error(
      `Cannot reduce fill level from ${container.fillLevel} to ${level}`,
    )
  }

  const now = new Date().toISOString()
  const updatedContainer: WasteContainer = {
    ...container,
    fillLevel: level,
    fillHistory: [
      ...container.fillHistory,
      { level, recordedAt: now, recordedBy: techId },
    ],
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  if (level === FillLevel.FULL) {
    updatedContainer.status = ContainerStatus.FULL
    updatedContainer.fillDate = now
  }

  const db = getDb()
  await db.transaction('rw', [db.waste_containers, db.syncQueue], async () => {
    await putWasteContainer(updatedContainer)
    await enqueueSyncEvent({
      resourceType: 'WasteContainer',
      resourceId: containerId,
      payload: updatedContainer,
      hlcTimestamp: updatedContainer.hlcTimestamp,
    })
  })
  reportWasteEvent({
    action: 'WASTE_FILL_LEVEL_UPDATED',
    containerId,
    location: container.location,
    containerType: container.type,
    actorId: techId,
  })
}

/** Dispose a container and create a disposal record. */
export async function disposeContainer(
  containerId: string,
  input: {
    disposedBy: string
    disposalMethod: DisposalMethod
    quantityEstimate: string
  },
): Promise<void> {
  const container = await getWasteContainerById(containerId)
  if (!container) {
    throw new Error(`Container ${containerId} not found`)
  }
  if (container.status === ContainerStatus.DISPOSED) {
    throw new Error(`Container ${containerId} is already disposed`)
  }

  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  const updatedContainer: WasteContainer = {
    ...container,
    status: ContainerStatus.DISPOSED,
    disposedBy: input.disposedBy,
    disposedAt: now,
    disposalMethod: input.disposalMethod,
    quantityEstimate: input.quantityEstimate,
    fillDate: container.fillDate ?? now,
    hlcTimestamp: hlcTs,
  }

  const disposalRecord: WasteDisposalRecord = {
    id: crypto.randomUUID(),
    containerId,
    type: container.type,
    disposedBy: input.disposedBy,
    disposedAt: now,
    disposalMethod: input.disposalMethod,
    quantityEstimate: input.quantityEstimate,
    location: container.location,
    hlcTimestamp: hlcTs,
  }

  const db = getDb()
  await db.transaction(
    'rw',
    [db.waste_containers, db.waste_disposal_records, db.syncQueue],
    async () => {
      await putWasteContainer(updatedContainer)
      await addDisposalRecord(disposalRecord)
      await enqueueSyncEvent({
        resourceType: 'WasteContainer',
        resourceId: containerId,
        payload: updatedContainer,
        hlcTimestamp: hlcTs,
      })
      await enqueueSyncEvent({
        resourceType: 'WasteDisposalRecord',
        resourceId: disposalRecord.id,
        payload: disposalRecord,
        hlcTimestamp: hlcTs,
      })
    },
  )
  reportWasteEvent({
    action: 'WASTE_CONTAINER_DISPOSED',
    containerId,
    location: container.location,
    containerType: container.type,
    actorId: input.disposedBy,
  })
}

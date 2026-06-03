/**
 * Equipment Booking & Scheduling — Story 51.4
 *
 * Instrument registry and batch queue logic.
 * All business logic lives here; components call these functions.
 *
 * No PHI: techId is an opaque practitioner ID; sampleIds are operational
 * references only. No patient demographics in any instrument/queue record.
 *
 * Architecture:
 * - Offline-first: reads/writes to Dexie only. Hub sync is async (Tier 3 LWW).
 * - Queue positions are sequential integers starting at 1.
 * - Average run time is a rolling average of the last 10 completed runs.
 * - Notifications are stored as InstrumentNotification records in Dexie.
 */

import Dexie from 'dexie'
import {
  getDb,
  type Instrument,
  type QueuedBatch,
  type InstrumentHistoryEntry,
  type InstrumentNotification,
} from './db'
import { emitEquipmentAuditEvent } from './audit-client'

// ---------------------------------------------------------------------------
// Supplemental types
// ---------------------------------------------------------------------------

export interface QueueBatchInput {
  techId: string
  techName: string
  sampleIds: string[]
  sampleCount: number
  testType: string
  estimatedRunMinutes?: number        // override; falls back to instrument avg
}

/** QueuedBatch enriched with computed estimated times. */
export interface QueuedBatchWithTimes extends QueuedBatch {
  estimatedStartTime: Date | null     // null = no queue
  estimatedCompletionTime: Date | null
}

// ---------------------------------------------------------------------------
// Instrument Registry Service (AC 1)
// ---------------------------------------------------------------------------

/**
 * Register a new instrument. Generates UUID + timestamps.
 * Returns the new instrument's ID.
 */
export async function registerInstrument(
  input: Omit<Instrument, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const db = getDb()
  const now = new Date().toISOString()
  const instrument: Instrument = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.instruments.add(instrument)
  emitEquipmentAuditEvent({
    action: 'CREATE',
    resourceType: 'INSTRUMENT',
    resourceId: instrument.id,
    detail: { name: instrument.name, type: instrument.type },
  })
  return instrument.id
}

/** Update mutable instrument fields (name, model, avgRunTimeMinutes, etc.). */
export async function updateInstrument(
  id: string,
  updates: Partial<Omit<Instrument, 'id' | 'createdAt'>>,
): Promise<void> {
  await getDb().instruments.update(id, { ...updates, updatedAt: new Date().toISOString() })
  emitEquipmentAuditEvent({
    action: 'UPDATE',
    resourceType: 'INSTRUMENT',
    resourceId: id,
    detail: updates,
  })
}

/**
 * Change instrument service status.
 * Out-of-service instruments cannot accept new batches.
 */
export async function setInstrumentStatus(
  id: string,
  status: 'IN_SERVICE' | 'OUT_OF_SERVICE',
  reason?: string,
): Promise<void> {
  await getDb().instruments.update(id, {
    status,
    outOfServiceReason: status === 'OUT_OF_SERVICE' ? (reason ?? null) : null,
    updatedAt: new Date().toISOString(),
  })
  emitEquipmentAuditEvent({
    action: 'UPDATE',
    resourceType: 'INSTRUMENT',
    resourceId: id,
    detail: { status, reason: reason ?? null },
  })
}

export async function getInstruments(): Promise<Instrument[]> {
  return getDb().instruments.toArray()
}

export async function getInstrumentById(id: string): Promise<Instrument | undefined> {
  return getDb().instruments.get(id)
}

// ---------------------------------------------------------------------------
// Batch Queue Service (AC 2, 3, 4, 6)
// ---------------------------------------------------------------------------

/**
 * Add a batch to an instrument's queue.
 * Validates instrument is IN_SERVICE.
 * Returns the full QueuedBatch with position assigned.
 */
export async function queueBatch(
  instrumentId: string,
  input: QueueBatchInput,
): Promise<QueuedBatch> {
  const db = getDb()

  const instrument = await db.instruments.get(instrumentId)
  if (!instrument) throw new Error(`Instrument ${instrumentId} not found`)
  if (instrument.status === 'OUT_OF_SERVICE') {
    throw new Error(`Instrument "${instrument.name}" is out of service and cannot accept new batches`)
  }

  // Determine next position (max position of active batches + 1)
  const existing = await db.instrument_queue
    .where('instrumentId')
    .equals(instrumentId)
    .filter((b) => b.status === 'QUEUED' || b.status === 'RUNNING')
    .toArray()

  const maxPosition = existing.reduce((max, b) => Math.max(max, b.position), 0)
  const position = maxPosition + 1

  const batch: QueuedBatch = {
    id: crypto.randomUUID(),
    instrumentId,
    techId: input.techId,
    techName: input.techName,
    sampleIds: input.sampleIds,
    sampleCount: input.sampleCount,
    testType: input.testType,
    estimatedRunMinutes: input.estimatedRunMinutes ?? instrument.avgRunTimeMinutes,
    position,
    status: 'QUEUED',
    queuedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  }

  await db.instrument_queue.add(batch)
  emitEquipmentAuditEvent({
    action: 'CREATE',
    resourceType: 'INSTRUMENT_BATCH',
    resourceId: batch.id,
    detail: { instrumentId, techId: input.techId },
  })
  return batch
}

/**
 * Get all QUEUED and RUNNING batches for an instrument, ordered by position,
 * with estimated start/completion times computed.
 */
export async function getInstrumentQueue(instrumentId: string): Promise<QueuedBatchWithTimes[]> {
  const db = getDb()
  const instrument = await db.instruments.get(instrumentId)
  if (!instrument) return []

  const batchList = await db.instrument_queue
    .where('instrumentId')
    .equals(instrumentId)
    .filter((b) => b.status === 'QUEUED' || b.status === 'RUNNING')
    .toArray()
  const batches = batchList.sort((a, b) => a.position - b.position)

  return computeQueueTimes(batches, instrument)
}

/** Mark the position-1 batch as RUNNING. Must be in position 1 and QUEUED. */
export async function startBatch(batchId: string): Promise<void> {
  const db = getDb()
  const batch = await db.instrument_queue.get(batchId)
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (batch.position !== 1) throw new Error('Only the first batch in queue can be started')
  if (batch.status !== 'QUEUED') throw new Error('Batch is not in QUEUED state')

  await db.instrument_queue.update(batchId, {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  })
}

/**
 * Mark a RUNNING batch as COMPLETED.
 * - Writes to instrument_history
 * - Updates instrument avg run time (rolling average of last 10 runs)
 * - Promotes next QUEUED batch to position 1
 * - Creates next-in-line notification for the promoted batch's owner
 */
export async function completeBatch(batchId: string): Promise<void> {
  const db = getDb()
  const batch = await db.instrument_queue.get(batchId)
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (batch.status !== 'RUNNING') throw new Error('Batch is not in RUNNING state')

  const completedAt = new Date().toISOString()
  const startedAt = batch.startedAt ? new Date(batch.startedAt) : new Date(batch.queuedAt)
  const actualRunMinutes = Math.max(
    1,
    Math.round((Date.now() - startedAt.getTime()) / 60_000),
  )

  let nextBatch: QueuedBatch | undefined

  await db.transaction(
    'rw',
    [db.instrument_queue, db.instrument_history, db.instruments],
    async () => {
      // Mark completed
      await db.instrument_queue.update(batchId, { status: 'COMPLETED', completedAt })

      // Write history entry
      const historyEntry: InstrumentHistoryEntry = {
        id: crypto.randomUUID(),
        instrumentId: batch.instrumentId,
        batchId: batch.id,
        techId: batch.techId,
        sampleCount: batch.sampleCount,
        runTimeMinutes: actualRunMinutes,
        completedAt,
      }
      await db.instrument_history.add(historyEntry)

      // Update instrument avg run time (rolling avg of last 10 completed runs)
      const allHistory = await db.instrument_history
        .where('instrumentId')
        .equals(batch.instrumentId)
        .toArray()
      // Sort descending by completedAt to get most recent runs first
      allHistory.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      const last10 = allHistory.slice(0, 10)
      if (last10.length > 0) {
        const newAvg = Math.round(
          last10.reduce((sum, h) => sum + h.runTimeMinutes, 0) / last10.length,
        )
        await db.instruments.update(batch.instrumentId, {
          avgRunTimeMinutes: newAvg,
          updatedAt: new Date().toISOString(),
        })
      }

      // Promote next batch: find QUEUED batch at position 2, move to position 1
      // Resequence all remaining QUEUED batches (positions 1-N)
      const allQueued = await db.instrument_queue
        .where('instrumentId')
        .equals(batch.instrumentId)
        .filter((b) => b.status === 'QUEUED')
        .toArray()
      allQueued.sort((a, b) => a.position - b.position)
      for (let i = 0; i < allQueued.length; i++) {
        await db.instrument_queue.update(allQueued[i].id, { position: i + 1 })
      }
      nextBatch = allQueued.length > 0 ? allQueued[0] : undefined
    },
  )

  // Emit next-in-line notification outside the transaction (non-fatal if it fails)
  if (nextBatch) {
    const instrument = await db.instruments.get(batch.instrumentId)
    if (instrument) {
      await createInstrumentNotification({
        techId: nextBatch.techId,
        instrumentId: batch.instrumentId,
        instrumentName: instrument.name,
        batchId: nextBatch.id,
        estimatedStartTime: new Date().toISOString(),
      })
    }
  }

  emitEquipmentAuditEvent({
    action: 'UPDATE',
    resourceType: 'INSTRUMENT_BATCH',
    resourceId: batchId,
    detail: { status: 'COMPLETED', instrumentId: batch.instrumentId },
  })
}

/**
 * Cancel a batch (owner or LAB_MANAGER).
 * Removes from active queue and reorders remaining positions.
 */
export async function cancelBatch(batchId: string, _reason: string): Promise<void> {
  const db = getDb()
  const batch = await db.instrument_queue.get(batchId)
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (batch.status === 'COMPLETED') throw new Error('Cannot cancel a completed batch')

  await db.transaction('rw', db.instrument_queue, async () => {
    await db.instrument_queue.update(batchId, {
      status: 'CANCELLED',
      completedAt: new Date().toISOString(),
    })
    // Re-fetch all QUEUED batches for this instrument and resequence positions
    const allQueued = await db.instrument_queue
      .where('instrumentId')
      .equals(batch.instrumentId)
      .filter((b) => b.status === 'QUEUED')
      .toArray()
    allQueued.sort((a, b) => a.position - b.position)
    for (let i = 0; i < allQueued.length; i++) {
      await db.instrument_queue.update(allQueued[i].id, { position: i + 1 })
    }
  })
}

/**
 * Reorder the queue by providing a new ordered list of batch IDs.
 * LAB_MANAGER only — enforced at the UI layer; service trusts the caller.
 * Notifies affected techs and emits audit event.
 */
export async function reorderQueue(
  instrumentId: string,
  newOrder: string[],
  reorderedByTechId: string,
): Promise<void> {
  const db = getDb()

  await db.transaction('rw', db.instrument_queue, async () => {
    for (let i = 0; i < newOrder.length; i++) {
      await db.instrument_queue.update(newOrder[i], { position: i + 1 })
    }
  })

  // Notify affected techs of their updated positions
  const instrument = await db.instruments.get(instrumentId)
  if (instrument) {
    const updatedQueue = await getInstrumentQueue(instrumentId)
    for (const batch of updatedQueue) {
      if (batch.status === 'QUEUED' || batch.status === 'RUNNING') {
        await createInstrumentNotification({
          techId: batch.techId,
          instrumentId,
          instrumentName: instrument.name,
          batchId: batch.id,
          estimatedStartTime: batch.estimatedStartTime?.toISOString() ?? new Date().toISOString(),
        })
      }
    }
  }

  emitEquipmentAuditEvent({
    action: 'UPDATE',
    resourceType: 'INSTRUMENT_QUEUE',
    resourceId: instrumentId,
    detail: { reorderedBy: reorderedByTechId },
  })
}

// ---------------------------------------------------------------------------
// Estimated Time Calculator (AC 3)
// ---------------------------------------------------------------------------

/**
 * Compute estimated start and completion times for each batch in the queue.
 *
 * First batch:
 *   - If RUNNING and startedAt set: startTime = startedAt (already running)
 *   - Otherwise: startTime = now (next to run)
 * Subsequent batches:
 *   - startTime  = previous batch's estimatedCompletionTime
 *   - completion = startTime + estimatedRunMinutes
 */
export function computeQueueTimes(
  queue: QueuedBatch[],
  instrument: Instrument,
): QueuedBatchWithTimes[] {
  const sorted = [...queue].sort((a, b) => a.position - b.position)
  const result: QueuedBatchWithTimes[] = []
  let cursor = new Date()

  for (let i = 0; i < sorted.length; i++) {
    const batch = sorted[i]
    let estimatedStartTime: Date

    if (i === 0 && batch.status === 'RUNNING' && batch.startedAt) {
      estimatedStartTime = new Date(batch.startedAt)
    } else {
      estimatedStartTime = cursor
    }

    const runMinutes =
      batch.estimatedRunMinutes > 0 ? batch.estimatedRunMinutes : instrument.avgRunTimeMinutes
    const estimatedCompletionTime = new Date(estimatedStartTime.getTime() + runMinutes * 60_000)
    cursor = estimatedCompletionTime

    result.push({ ...batch, estimatedStartTime, estimatedCompletionTime })
  }

  return result
}

// ---------------------------------------------------------------------------
// Instrument Notifications — Dexie-based, offline-capable (AC 4)
// ---------------------------------------------------------------------------

/** Store a next-in-line (or position-changed) notification for a tech. */
export async function createInstrumentNotification(input: {
  techId: string
  instrumentId: string
  instrumentName: string
  batchId: string
  estimatedStartTime: string
}): Promise<void> {
  const db = getDb()
  const notif: InstrumentNotification = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: new Date().toISOString(),
    dismissed: false,
  }
  await db.instrument_notifications.add(notif)
}

/** Return undismissed notifications for a specific tech, newest first. */
export async function getActiveInstrumentNotifications(
  techId: string,
): Promise<InstrumentNotification[]> {
  const notifications = await getDb()
    .instrument_notifications
    .where('techId')
    .equals(techId)
    .filter((n) => !n.dismissed)
    .toArray()
  return notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Dismiss a notification. */
export async function dismissInstrumentNotification(id: string): Promise<void> {
  await getDb().instrument_notifications.update(id, { dismissed: true })
}

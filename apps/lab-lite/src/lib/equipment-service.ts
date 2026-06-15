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
  insertAtPosition?: number           // manager insert-at-position; undefined = append
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
 * Validates avgRunTimeMinutes >= 1.
 * Returns the new instrument's ID.
 */
export async function registerInstrument(
  input: Omit<Instrument, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  // P15: validate avgRunTimeMinutes to prevent zero collapsing all queue times
  if (!input.avgRunTimeMinutes || input.avgRunTimeMinutes < 1) {
    throw new Error('Average run time must be at least 1 minute')
  }
  const db = getDb()
  const now = new Date().toISOString()
  const instrument: Instrument = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  await db.instruments.add(instrument)
  await emitEquipmentAuditEvent({
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
  if (updates.avgRunTimeMinutes !== undefined && updates.avgRunTimeMinutes < 1) {
    throw new Error('Average run time must be at least 1 minute')
  }
  await getDb().instruments.update(id, { ...updates, updatedAt: new Date().toISOString() })
  await emitEquipmentAuditEvent({
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
  await emitEquipmentAuditEvent({
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
 * Validates instrument is IN_SERVICE and estimatedRunMinutes is valid.
 * Supports manager insert-at-position via input.insertAtPosition.
 * Entire position assignment is transactional to prevent concurrent duplicates.
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

  // P6: validate estimatedRunMinutes override — reject NaN
  const runMinutesOverride = input.estimatedRunMinutes
  if (runMinutesOverride !== undefined && (isNaN(runMinutesOverride) || runMinutesOverride < 1)) {
    throw new Error('Estimated run time override must be a whole number of at least 1 minute')
  }

  let batch!: QueuedBatch

  // P14: wrap position assignment + insert in a single transaction to prevent
  // concurrent calls from reading the same maxPosition and producing duplicates.
  await db.transaction('rw', db.instrument_queue, async () => {
    const existing = await db.instrument_queue
      .where('instrumentId')
      .equals(instrumentId)
      .filter((b) => b.status === 'QUEUED' || b.status === 'RUNNING')
      .toArray()

    const maxPosition = existing.reduce((max, b) => Math.max(max, b.position), 0)

    // P7: insertAtPosition support — manager can inject at any slot.
    // If insertAtPosition is specified and valid, shift all batches at that position or later.
    let position: number
    if (input.insertAtPosition !== undefined && input.insertAtPosition >= 1 && input.insertAtPosition <= maxPosition + 1) {
      position = input.insertAtPosition
      // Shift existing batches at or after the insert position
      const toShift = existing.filter((b) => b.position >= position).sort((a, b) => b.position - a.position)
      for (const b of toShift) {
        await db.instrument_queue.update(b.id, { position: b.position + 1 })
      }
    } else {
      position = maxPosition + 1
    }

    batch = {
      id: crypto.randomUUID(),
      instrumentId,
      techId: input.techId,
      techName: input.techName,
      sampleIds: input.sampleIds,
      sampleCount: input.sampleCount,
      testType: input.testType,
      estimatedRunMinutes: runMinutesOverride ?? instrument.avgRunTimeMinutes,
      position,
      status: 'QUEUED',
      cancelReason: null,
      queuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    }

    await db.instrument_queue.add(batch)
  })

  await emitEquipmentAuditEvent({
    action: 'CREATE',
    resourceType: 'INSTRUMENT_BATCH',
    resourceId: batch.id,
    detail: { instrumentId, techId: input.techId, position: batch.position },
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

/**
 * Mark the position-1 batch as RUNNING.
 * Validates: must be in position 1, QUEUED, and no other RUNNING batch on the instrument.
 */
export async function startBatch(batchId: string): Promise<void> {
  const db = getDb()
  const batch = await db.instrument_queue.get(batchId)
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (batch.position !== 1) throw new Error('Only the first batch in queue can be started')
  if (batch.status !== 'QUEUED') throw new Error('Batch is not in QUEUED state')

  // P2: guard against two RUNNING batches on the same instrument (multi-tab race)
  const existingRunning = await db.instrument_queue
    .where('instrumentId')
    .equals(batch.instrumentId)
    .filter((b) => b.status === 'RUNNING')
    .toArray()
  if (existingRunning.length > 0) {
    throw new Error('Another batch is already running on this instrument')
  }

  await db.instrument_queue.update(batchId, {
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
  })
}

/**
 * Mark a RUNNING batch as COMPLETED.
 * - Writes to instrument_history
 * - Updates instrument avg run time (rolling average of last 10 runs, bounded query)
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

      // P11: bounded history query — use compound index to get only the last 10 runs.
      // Sort descending by completedAt using the [instrumentId+completedAt] compound index.
      const recentHistory = await db.instrument_history
        .where('[instrumentId+completedAt]')
        .between(
          [batch.instrumentId, Dexie.minKey],
          [batch.instrumentId, Dexie.maxKey],
        )
        .reverse()
        .sortBy('completedAt')
        .then((all) => all.slice(0, 10))
      if (recentHistory.length > 0) {
        const newAvg = Math.max(
          1,
          Math.round(recentHistory.reduce((sum, h) => sum + h.runTimeMinutes, 0) / recentHistory.length),
        )
        await db.instruments.update(batch.instrumentId, {
          avgRunTimeMinutes: newAvg,
          updatedAt: new Date().toISOString(),
        })
      }

      // Promote next batch: resequence all remaining QUEUED batches to positions 1..N
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
        type: 'NEXT_IN_LINE',
        estimatedStartTime: new Date().toISOString(),
      })
    }
  }

  await emitEquipmentAuditEvent({
    action: 'UPDATE',
    resourceType: 'INSTRUMENT_BATCH',
    resourceId: batchId,
    detail: { status: 'COMPLETED', instrumentId: batch.instrumentId },
  })
}

/**
 * Cancel a batch (owner or LAB_MANAGER).
 * - Stores the cancellation reason (P1).
 * - Resequences all remaining active batches — including promotion when a RUNNING
 *   batch at position 1 is cancelled (P4).
 * - Notifies the owning tech that their batch was cancelled (D1).
 */
export async function cancelBatch(batchId: string, reason: string): Promise<void> {
  const db = getDb()
  const batch = await db.instrument_queue.get(batchId)
  if (!batch) throw new Error(`Batch ${batchId} not found`)
  if (batch.status === 'COMPLETED') throw new Error('Cannot cancel a completed batch')

  await db.transaction('rw', db.instrument_queue, async () => {
    // P1: store reason
    await db.instrument_queue.update(batchId, {
      status: 'CANCELLED',
      cancelReason: reason || null,
      completedAt: new Date().toISOString(),
    })
    // P4: resequence ALL active (QUEUED + still-running) batches so position 1 is
    // always occupied after a cancellation, even if the cancelled batch was RUNNING.
    const remaining = await db.instrument_queue
      .where('instrumentId')
      .equals(batch.instrumentId)
      .filter((b) => b.status === 'QUEUED' || b.status === 'RUNNING')
      .toArray()
    remaining.sort((a, b) => a.position - b.position)
    for (let i = 0; i < remaining.length; i++) {
      await db.instrument_queue.update(remaining[i].id, { position: i + 1 })
    }
  })

  // D1: notify the tech whose batch was cancelled so they can re-queue
  const instrument = await db.instruments.get(batch.instrumentId)
  if (instrument) {
    await createInstrumentNotification({
      techId: batch.techId,
      instrumentId: batch.instrumentId,
      instrumentName: instrument.name,
      batchId: batch.id,
      type: 'BATCH_CANCELLED',
      estimatedStartTime: new Date().toISOString(),
    })
  }

  await emitEquipmentAuditEvent({
    action: 'UPDATE',
    resourceType: 'INSTRUMENT_BATCH',
    resourceId: batchId,
    detail: { status: 'CANCELLED', instrumentId: batch.instrumentId, reason },
  })
}

/**
 * Reorder the queue by providing a complete ordered list of active batch IDs.
 * LAB_MANAGER only — enforced at the UI layer; service validates IDs belong to the instrument.
 * Notifies affected techs and emits audit event.
 */
export async function reorderQueue(
  instrumentId: string,
  newOrder: string[],
  reorderedByTechId: string,
): Promise<void> {
  const db = getDb()

  // P5: validate all IDs belong to this instrument and are active
  const activeBatches = await db.instrument_queue
    .where('instrumentId')
    .equals(instrumentId)
    .filter((b) => b.status === 'QUEUED' || b.status === 'RUNNING')
    .toArray()
  const activeBatchIds = new Set(activeBatches.map((b) => b.id))
  for (const id of newOrder) {
    if (!activeBatchIds.has(id)) {
      throw new Error(`Batch ${id} does not belong to instrument ${instrumentId} or is not active`)
    }
  }
  // All active batches must be represented in newOrder to prevent position gaps
  if (newOrder.length !== activeBatches.length) {
    throw new Error('newOrder must contain all active batches for the instrument')
  }

  await db.transaction('rw', db.instrument_queue, async () => {
    for (let i = 0; i < newOrder.length; i++) {
      await db.instrument_queue.update(newOrder[i], { position: i + 1 })
    }
  })

  // Notify affected techs of their updated positions (QUEUED batches only — RUNNING position is fixed)
  const instrument = await db.instruments.get(instrumentId)
  if (instrument) {
    const updatedQueue = await getInstrumentQueue(instrumentId)
    for (const batch of updatedQueue) {
      if (batch.status === 'QUEUED') {
        await createInstrumentNotification({
          techId: batch.techId,
          instrumentId,
          instrumentName: instrument.name,
          batchId: batch.id,
          type: 'NEXT_IN_LINE',
          estimatedStartTime: batch.estimatedStartTime?.toISOString() ?? new Date().toISOString(),
        })
      }
    }
  }

  await emitEquipmentAuditEvent({
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
 *   - Otherwise: startTime = now (next to run); isNow = true for "Now" display
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

    // P15 + P6: guard against zero/NaN run times that collapse all times to same point
    const rawRunMinutes = batch.estimatedRunMinutes > 0 && !isNaN(batch.estimatedRunMinutes)
      ? batch.estimatedRunMinutes
      : instrument.avgRunTimeMinutes
    const runMinutes = Math.max(1, rawRunMinutes)

    const estimatedCompletionTime = new Date(estimatedStartTime.getTime() + runMinutes * 60_000)
    cursor = estimatedCompletionTime

    result.push({ ...batch, estimatedStartTime, estimatedCompletionTime })
  }

  return result
}

// ---------------------------------------------------------------------------
// Instrument Notifications — Dexie-based, offline-capable (AC 4)
// ---------------------------------------------------------------------------

/** Store a notification for a tech (next-in-line or batch-cancelled). */
export async function createInstrumentNotification(input: {
  techId: string
  instrumentId: string
  instrumentName: string
  batchId: string
  type: InstrumentNotification['type']
  estimatedStartTime: string
}): Promise<void> {
  const db = getDb()
  const notif: InstrumentNotification = {
    id: crypto.randomUUID(),
    techId: input.techId,
    instrumentId: input.instrumentId,
    instrumentName: input.instrumentName,
    batchId: input.batchId,
    type: input.type,
    message: '',           // populated by UI layer using localised t() strings
    estimatedStartTime: input.estimatedStartTime,
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

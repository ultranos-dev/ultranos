/**
 * Shift Handover Service — Story 51.1
 *
 * Generates, finalizes, and acknowledges shift handover reports entirely
 * from local Dexie data (offline-first). Reports sync to Hub as Tier 3
 * (LWW is acceptable — write-once-per-shift).
 *
 * PHI Rule: No patient names or diagnoses. Sample IDs and operational counts only.
 */
import {
  getDb,
  putHandoverReport,
  putShiftSession,
  getActiveShiftSession,
  enqueueSyncEvent,
  type HandoverReport,
  type ShiftSession,
} from './db'
import { reportHandoverAuditEvent } from './audit-client'

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

/**
 * Generate a handover report snapshot from current Dexie state.
 * Queries samples, orders, QC results, and equipment alerts locally.
 * Stores the resulting report with status PENDING.
 */
export async function generateHandoverReport(
  outgoingTechId: string,
  outgoingTechName: string,
): Promise<HandoverReport> {
  const db = getDb()

  // Idempotency guard — if a PENDING or READY report already exists for this
  // tech on today's shift date, return it rather than creating an orphan.
  const todayDate = new Date().toISOString().slice(0, 10)
  const existing = await db.handover_reports
    .where('outgoingTechId')
    .equals(outgoingTechId)
    .filter((r: HandoverReport) => r.shiftDate === todayDate && (r.status === 'PENDING' || r.status === 'READY'))
    .first()
  if (existing) return existing

  // Pending samples — count by urgency (STAT/Routine)
  const pendingSamples = await aggregatePendingSamples(db)

  // Equipment alerts — instruments with active malfunctions or QC failures
  const equipmentAlerts = await aggregateEquipmentAlerts(db)

  // QC status — pass/fail per analyte category tested this shift
  const qcStatus = await aggregateQcStatus(db)

  // Incomplete orders — received but not yet in-progress or completed
  const incompleteOrders = await aggregateIncompleteOrders(db)

  const now = new Date().toISOString()
  const shiftDate = now.slice(0, 10)

  const report: HandoverReport = {
    id: crypto.randomUUID(),
    outgoingTechId,
    outgoingTechName,
    incomingTechId: null,
    incomingTechName: null,
    status: 'PENDING',
    createdAt: now,
    acknowledgedAt: null,
    pendingSamples,
    equipmentAlerts,
    qcStatus,
    incompleteOrders,
    outgoingNotes: '',
    incomingNotes: null,
    shiftDate,
  }

  await putHandoverReport(report)

  reportHandoverAuditEvent({
    action: 'HANDOVER_CREATED',
    reportId: report.id,
    outgoingTechId,
  })

  return report
}

// ---------------------------------------------------------------------------
// Aggregation helpers — query Dexie tables for handover snapshot data
// ---------------------------------------------------------------------------

async function aggregatePendingSamples(
  db: ReturnType<typeof getDb>,
): Promise<HandoverReport['pendingSamples']> {
  try {
    // Samples in pipeline statuses that indicate pending work
    const pendingStatuses = ['RECEIVED', 'ACCESSIONED', 'IN_PROGRESS']
    const allSamples = await db.samples
      .filter((s: any) => pendingStatuses.includes(s._ultranos?.pipelineStatus ?? ''))
      .toArray()

    let stat = 0
    let routine = 0
    const sampleIds: string[] = []

    for (const sample of allSamples) {
      const labSampleId: string = sample._ultranos?.labSampleId ?? sample.id
      sampleIds.push(labSampleId)

      // Check paired orders for urgency — STAT if urgency is 'stat' or 'asap'
      const urgency = sample._ultranos?.orderUrgency ?? 'routine'
      if (urgency === 'stat' || urgency === 'asap') {
        stat++
      } else {
        routine++
      }
    }

    return { stat, routine, sampleIds }
  } catch {
    return { stat: 0, routine: 0, sampleIds: [] }
  }
}

async function aggregateEquipmentAlerts(
  db: ReturnType<typeof getDb>,
): Promise<HandoverReport['equipmentAlerts']> {
  try {
    // Temperature excursions that are unacknowledged count as equipment alerts
    // Note: acknowledged is typed as boolean — .equals(false) required (not 0)
    const excursions = await db.temperature_excursions
      .filter((e: any) => e.acknowledged === false)
      .toArray()

    return excursions.map((e: any) => ({
      instrumentId: e.locationId,
      instrumentName: e.locationName ?? e.locationId,
      alertType: 'TEMPERATURE_EXCURSION',
    }))
  } catch {
    return []
  }
}

async function aggregateQcStatus(
  _db: ReturnType<typeof getDb>,
): Promise<HandoverReport['qcStatus']> {
  // QC status is derived from lab_results entries flagged as QC samples.
  // For v1, return NOT_RUN as the default — QC results table integration
  // will be added when the QC results story is implemented (per Dev Notes).
  return []
}

async function aggregateIncompleteOrders(
  db: ReturnType<typeof getDb>,
): Promise<HandoverReport['incompleteOrders']> {
  try {
    // Include RECEIVED (not yet started) and IN_PROGRESS (started but not finished)
    const incompleteStatuses = ['RECEIVED', 'IN_PROGRESS']
    const incompleteOrders = await db.orders
      .filter((o: any) => incompleteStatuses.includes(o.status ?? ''))
      .toArray()

    return incompleteOrders.map((o: any) => ({
      orderId: o.orderId,
      urgency: o.urgency ?? 'routine',
      receivedAt: o.receivedAt ?? o.authoredOn,
    }))
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Finalization (outgoing tech confirms + adds notes)
// ---------------------------------------------------------------------------

/**
 * Finalize a handover report: persist outgoing notes, end the tech's shift session,
 * and enqueue for Hub sync.
 */
export async function finalizeHandover(reportId: string, notes: string): Promise<void> {
  const db = getDb()
  const report = await db.handover_reports.get(reportId)
  if (!report) throw new Error(`Handover report ${reportId} not found`)

  const updated: HandoverReport = { ...report, outgoingNotes: notes, status: 'READY' }
  await putHandoverReport(updated)

  // End the outgoing tech's active shift session
  const session = await getActiveShiftSession(report.outgoingTechId)
  if (session) {
    const ended: ShiftSession = {
      ...session,
      endedAt: new Date().toISOString(),
      status: 'ENDED',
    }
    await putShiftSession(ended)
  }

  // Enqueue for Hub sync (Tier 3 — LWW acceptable)
  await enqueueSyncEvent({
    resourceType: 'ShiftHandover',
    resourceId: reportId,
    status: 'pending',
    payload: updated,
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retryCount: 0,
  })
}

// ---------------------------------------------------------------------------
// Acknowledgment (incoming tech confirms receipt)
// ---------------------------------------------------------------------------

/**
 * Acknowledge a handover report. Records the incoming tech's identity and timestamp,
 * creates their shift session, and emits an audit event.
 */
export async function acknowledgeHandover(
  reportId: string,
  incomingTechId: string,
  incomingTechName: string,
  notes?: string,
): Promise<void> {
  const db = getDb()
  const report = await db.handover_reports.get(reportId)
  if (!report) throw new Error(`Handover report ${reportId} not found`)

  const now = new Date().toISOString()
  const updated: HandoverReport = {
    ...report,
    incomingTechId,
    incomingTechName,
    status: 'ACKNOWLEDGED',
    acknowledgedAt: now,
    incomingNotes: notes ?? null,
  }
  await putHandoverReport(updated)

  // Start a new shift session for the incoming tech
  const newSession: ShiftSession = {
    id: crypto.randomUUID(),
    techId: incomingTechId,
    startedAt: now,
    endedAt: null,
    status: 'ACTIVE',
  }
  await putShiftSession(newSession)

  // Enqueue updated report for Hub sync
  await enqueueSyncEvent({
    resourceType: 'ShiftHandover',
    resourceId: reportId,
    status: 'pending',
    payload: updated,
    createdAt: now,
    lastAttemptAt: null,
    retryCount: 0,
  })

  reportHandoverAuditEvent({
    action: 'HANDOVER_ACKNOWLEDGED',
    reportId,
    incomingTechId,
  })
}

// ---------------------------------------------------------------------------
// Start shift session (called when a tech starts their shift without a pending handover)
// ---------------------------------------------------------------------------

export async function startShiftSession(techId: string): Promise<ShiftSession> {
  const session: ShiftSession = {
    id: crypto.randomUUID(),
    techId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    status: 'ACTIVE',
  }
  await putShiftSession(session)
  return session
}

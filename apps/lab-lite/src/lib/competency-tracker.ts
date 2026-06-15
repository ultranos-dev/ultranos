/**
 * Competency Procedure Frequency Tracker — Story 46.3
 *
 * Maintains a per-(technicianId, procedureRef) competency record derived
 * entirely from the result history. No patient data is accessed or stored —
 * queries use technicianId + procedureRef (LOINC code) only.
 *
 * Status thresholds (green / yellow / red):
 *   active      — last performed within decayThresholdDays (default 45)
 *   decay_risk  — last performed between 45 and 90 days ago
 *   decayed     — last performed > 90 days ago OR never performed
 */

import { getDb } from '@/lib/db'
import {
  DEFAULT_DECAY_THRESHOLD_DAYS,
  DEFAULT_RED_THRESHOLD_DAYS,
  type ProcedureCompetency,
  type CompetencyStatus,
  type CompetencySnapshot,
  type SnapshotProcedureRecord,
} from '@/lib/competency-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Whole days between two ISO 8601 timestamps. Returns 0 for same-day. */
export function daysBetween(earlier: string | null, later: string): number {
  if (!earlier) return Infinity
  const ms = new Date(later).getTime() - new Date(earlier).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

/** Resolve the competency status based on days since last performance. */
export function resolveStatus(
  daysSinceLast: number,
  decayThresholdDays: number,
  redThresholdDays: number,
): CompetencyStatus {
  if (daysSinceLast <= decayThresholdDays) return 'active'
  if (daysSinceLast <= redThresholdDays) return 'decay_risk'
  return 'decayed'
}

/** ISO date string "YYYY-MM-DD" for today (local). */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** ISO 8601 instant string for "now". */
function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// Core update — called after every result entry
// ---------------------------------------------------------------------------

/**
 * Update (or create) the competency record for one (technicianId, procedureRef)
 * pair after a result is saved.
 *
 * Called by the result entry save handler (Story 42.4 integration).
 */
export async function updateCompetencyFromResult(
  technicianId: string,
  procedureRef: string,
  procedureName: string,
  performedAt: string,
): Promise<void> {
  const db = getDb()
  const now = nowIso()

  // Look up the existing record, if any
  const existing = await db.procedure_competencies
    .where('[technicianId+procedureRef]')
    .equals([technicianId, procedureRef])
    .first()

  if (existing) {
    // Update the existing record
    const lastPerformedAt =
      existing.lastPerformedAt === null ||
      performedAt > existing.lastPerformedAt
        ? performedAt
        : existing.lastPerformedAt

    const daysSinceLast = daysBetween(lastPerformedAt, now)
    const status = resolveStatus(
      daysSinceLast,
      existing.decayThresholdDays,
      existing.redThresholdDays,
    )

    // Recount last-90-days from the result table for accuracy
    const cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - 90)
    const cutoffIso = cutoff.toISOString()

    const recentResults = await db.lab_results
      .where('enteredBy')
      .equals(technicianId)
      .filter((r) => r.loincCode === procedureRef && r.enteredAt >= cutoffIso)
      .count()

    await db.procedure_competencies.update(existing.id, {
      lastPerformedAt,
      totalPerformed: existing.totalPerformed + 1,
      performedLast90Days: recentResults,
      status,
      updatedAt: now,
    })
  } else {
    // First time this technician has performed this procedure
    const id = crypto.randomUUID()
    const record: ProcedureCompetency = {
      id,
      technicianId,
      procedureRef,
      procedureName,
      lastPerformedAt: performedAt,
      totalPerformed: 1,
      performedLast90Days: 1,
      status: 'active',
      decayThresholdDays: DEFAULT_DECAY_THRESHOLD_DAYS,
      redThresholdDays: DEFAULT_RED_THRESHOLD_DAYS,
      updatedAt: now,
    }
    await db.procedure_competencies.put(record)
  }
}

// ---------------------------------------------------------------------------
// Bulk recalculation — scans full result history
// ---------------------------------------------------------------------------

/**
 * Scan all lab results for the technician and rebuild competency records from
 * scratch. Returns the updated competency array.
 *
 * Use this on first run, after import, or for periodic reconciliation.
 */
export async function recalculateAllCompetencies(
  technicianId: string,
): Promise<ProcedureCompetency[]> {
  const db = getDb()
  const now = nowIso()

  const cutoff90 = new Date(now)
  cutoff90.setDate(cutoff90.getDate() - 90)
  const cutoff90Iso = cutoff90.toISOString()

  // Fetch all results for this tech (no patient data — loincCode + enteredAt only)
  const results = await db.lab_results
    .where('enteredBy')
    .equals(technicianId)
    .toArray()

  // Group by procedure
  const map = new Map<
    string,
    {
      loincCode: string
      loincDisplay: string
      latestAt: string
      total: number
      last90: number
    }
  >()

  for (const r of results) {
    const entry = map.get(r.loincCode)
    if (!entry) {
      map.set(r.loincCode, {
        loincCode: r.loincCode,
        loincDisplay: r.loincDisplay ?? r.loincCode,
        latestAt: r.enteredAt,
        total: 1,
        last90: r.enteredAt >= cutoff90Iso ? 1 : 0,
      })
    } else {
      if (r.enteredAt > entry.latestAt) entry.latestAt = r.enteredAt
      entry.total++
      if (r.enteredAt >= cutoff90Iso) entry.last90++
    }
  }

  // Fetch existing records to preserve configurable thresholds
  const existingRecords = await db.procedure_competencies
    .where('technicianId')
    .equals(technicianId)
    .toArray()

  const existingByRef = new Map(existingRecords.map((r) => [r.procedureRef, r]))

  const upserted: ProcedureCompetency[] = []

  for (const [procedureRef, data] of map) {
    const existing = existingByRef.get(procedureRef)
    const decayThresholdDays =
      existing?.decayThresholdDays ?? DEFAULT_DECAY_THRESHOLD_DAYS
    const redThresholdDays =
      existing?.redThresholdDays ?? DEFAULT_RED_THRESHOLD_DAYS
    const daysSinceLast = daysBetween(data.latestAt, now)
    const status = resolveStatus(daysSinceLast, decayThresholdDays, redThresholdDays)

    const record: ProcedureCompetency = {
      id: existing?.id ?? crypto.randomUUID(),
      technicianId,
      procedureRef,
      procedureName: data.loincDisplay,
      lastPerformedAt: data.latestAt,
      totalPerformed: data.total,
      performedLast90Days: data.last90,
      status,
      decayThresholdDays,
      redThresholdDays,
      updatedAt: now,
    }
    upserted.push(record)
  }

  await db.procedure_competencies.bulkPut(upserted)

  return db.procedure_competencies
    .where('technicianId')
    .equals(technicianId)
    .toArray()
}

// ---------------------------------------------------------------------------
// Daily snapshot
// ---------------------------------------------------------------------------

/**
 * Generate a lightweight CompetencySnapshot for today, if one does not already
 * exist. Call this once on first app open each day.
 *
 * Snapshots are used by the dashboard to compute trend indicators.
 */
export async function generateDailySnapshot(
  technicianId: string,
): Promise<void> {
  const db = getDb()
  const today = todayDate()

  // Guard: only one snapshot per day
  const existing = await db.competency_snapshots
    .where('[technicianId+snapshotDate]' as any)
    .equals([technicianId, today] as any)
    .first()

  if (existing) return

  const competencies = await db.procedure_competencies
    .where('technicianId')
    .equals(technicianId)
    .toArray()

  const now = nowIso()
  const procedures: SnapshotProcedureRecord[] = competencies.map((c) => ({
    procedureRef: c.procedureRef,
    status: c.status,
    daysSinceLast: c.lastPerformedAt
      ? daysBetween(c.lastPerformedAt, now)
      : null,
  }))

  const snapshot: CompetencySnapshot = {
    id: crypto.randomUUID(),
    technicianId,
    snapshotDate: today,
    procedures,
    syncStatus: 'pending',
  }

  await db.competency_snapshots.put(snapshot)
}

// ---------------------------------------------------------------------------
// Trend calculation helper
// ---------------------------------------------------------------------------

/**
 * Returns the trend for a specific procedure by comparing the current status
 * against the snapshot from ~7 days ago.
 *
 * Returns null if insufficient history exists.
 */
export async function getProcedureTrend(
  technicianId: string,
  procedureRef: string,
): Promise<'improving' | 'stable' | 'declining' | null> {
  const db = getDb()

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 7)
  const cutoffStr = cutoffDate.toISOString().slice(0, 10)

  const snapshots = await db.competency_snapshots
    .where('technicianId')
    .equals(technicianId)
    .filter((s) => s.snapshotDate <= cutoffStr)
    .sortBy('snapshotDate')

  if (snapshots.length === 0) return null

  const oldSnapshot = snapshots[snapshots.length - 1]
  const oldRecord = oldSnapshot.procedures.find(
    (p) => p.procedureRef === procedureRef,
  )
  if (!oldRecord) return null

  const current = await db.procedure_competencies
    .where('[technicianId+procedureRef]')
    .equals([technicianId, procedureRef])
    .first()

  if (!current) return null

  const statusRank: Record<CompetencyStatus, number> = {
    active: 2,
    decay_risk: 1,
    decayed: 0,
  }

  const oldRank = statusRank[oldRecord.status]
  const newRank = statusRank[current.status]

  if (newRank > oldRank) return 'improving'
  if (newRank < oldRank) return 'declining'
  return 'stable'
}

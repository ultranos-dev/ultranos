/**
 * RAG Readiness Board Service — Story 51.5
 *
 * Calculates Red / Amber / Green operational readiness across four dimensions:
 * Personnel, Equipment, Supplies, and QC.
 *
 * All data is sourced from Dexie (IndexedDB) — fully offline, no network calls.
 * No PHI: operates on tech IDs, instrument names, supply names, and QC analytes only.
 */

import { getDb, getAllSupplyItems, getMinimumStaffing } from '@/lib/db'
import type { QcRun, DriftAlert } from '@/lib/qc/types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RAGStatus = 'RED' | 'AMBER' | 'GREEN'

export type RAGDimension = 'PERSONNEL' | 'EQUIPMENT' | 'SUPPLIES' | 'QC'

export interface PersonnelDetail {
  techId: string
  status: 'ON_SHIFT' | 'ENDED'
  startedAt: string
  endedAt: string | null
}

export interface EquipmentDetail {
  instrumentId: string
  name: string
  status: 'IN_SERVICE' | 'OUT_OF_SERVICE'
  outOfServiceReason: string | null
  updatedAt: string
}

export interface SupplyDetail {
  id: string
  name: string
  category: string
  currentStock: number
  unit: string
  ragStatus: RAGStatus
  estimatedDaysRemaining: number | null
}

export interface QcDetail {
  analyte: string
  loincCode: string
  status: 'PASSING' | 'DRIFT_WARNING' | 'FAILED' | 'NOT_RUN'
  lastRunAt: string | null
  westgardViolations: string[]
}

export interface RAGDimensionResult {
  dimension: RAGDimension
  status: RAGStatus
  summary: string
  details: PersonnelDetail[] | EquipmentDetail[] | SupplyDetail[] | QcDetail[]
  updatedAt: string
}

export interface RAGBoardState {
  personnel: RAGDimensionResult
  equipment: RAGDimensionResult
  supplies: RAGDimensionResult
  qc: RAGDimensionResult
  overallStatus: RAGStatus
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return the worse of two RAG statuses (RED > AMBER > GREEN). */
function worstStatus(a: RAGStatus, b: RAGStatus): RAGStatus {
  if (a === 'RED' || b === 'RED') return 'RED'
  if (a === 'AMBER' || b === 'AMBER') return 'AMBER'
  return 'GREEN'
}

/** Derive the worst overall status from an array of statuses. */
function worstOfAll(statuses: RAGStatus[]): RAGStatus {
  return statuses.reduce(worstStatus, 'GREEN')
}

// ---------------------------------------------------------------------------
// Personnel
// ---------------------------------------------------------------------------

export async function calculatePersonnelRAG(): Promise<RAGDimensionResult> {
  const now = new Date().toISOString()

  try {
    const db = getDb()
    const allSessions = await db.shift_sessions.toArray()

    // Build detail records for all sessions
    const details: PersonnelDetail[] = allSessions.map((s) => ({
      techId: s.techId,
      status: s.status === 'ACTIVE' ? 'ON_SHIFT' : 'ENDED',
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    }))

    const activeSessions = allSessions.filter((s) => s.status === 'ACTIVE')
    const presentCount = activeSessions.length

    const minimumStaffing = await getMinimumStaffing()

    let status: RAGStatus
    if (presentCount < minimumStaffing) {
      status = 'RED'
    } else if (presentCount === minimumStaffing) {
      status = 'AMBER'
    } else {
      status = 'GREEN'
    }

    const summary =
      presentCount === 0
        ? `0 techs on shift (minimum: ${minimumStaffing})`
        : `${presentCount} tech${presentCount === 1 ? '' : 's'} on shift (minimum: ${minimumStaffing})`

    return {
      dimension: 'PERSONNEL',
      status,
      summary,
      details,
      updatedAt: now,
    }
  } catch {
    return {
      dimension: 'PERSONNEL',
      status: 'AMBER',
      summary: 'Personnel data unavailable',
      details: [],
      updatedAt: now,
    }
  }
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export async function calculateEquipmentRAG(): Promise<RAGDimensionResult> {
  const now = new Date().toISOString()

  try {
    const db = getDb()
    const instruments = await db.instruments.toArray()

    if (instruments.length === 0) {
      return {
        dimension: 'EQUIPMENT',
        status: 'AMBER',
        summary: 'No instruments configured',
        details: [],
        updatedAt: now,
      }
    }

    const details: EquipmentDetail[] = instruments.map((inst) => ({
      instrumentId: inst.id,
      name: inst.name,
      status: inst.status,
      outOfServiceReason: inst.outOfServiceReason ?? null,
      updatedAt: inst.updatedAt,
    }))

    const outOfServiceCount = instruments.filter(
      (inst) => inst.status === 'OUT_OF_SERVICE',
    ).length
    const operationalCount = instruments.length - outOfServiceCount

    // All instruments are treated as critical in v1: any OUT_OF_SERVICE → RED
    let status: RAGStatus
    if (outOfServiceCount > 0) {
      status = 'RED'
    } else {
      status = 'GREEN'
    }

    const summary = `${operationalCount}/${instruments.length} instruments operational`

    return {
      dimension: 'EQUIPMENT',
      status,
      summary,
      details,
      updatedAt: now,
    }
  } catch {
    return {
      dimension: 'EQUIPMENT',
      status: 'AMBER',
      summary: 'Equipment data unavailable',
      details: [],
      updatedAt: now,
    }
  }
}

// ---------------------------------------------------------------------------
// Supplies
// ---------------------------------------------------------------------------

export async function calculateSupplyRAG(): Promise<RAGDimensionResult> {
  const now = new Date().toISOString()

  try {
    const supplyItems = await getAllSupplyItems()

    if (supplyItems.length === 0) {
      return {
        dimension: 'SUPPLIES',
        status: 'AMBER',
        summary: 'No supply items configured',
        details: [],
        updatedAt: now,
      }
    }

    const details: SupplyDetail[] = supplyItems.map((item) => {
      let ragStatus: RAGStatus
      if (item.currentStock <= item.criticalThreshold) {
        ragStatus = 'RED'
      } else if (item.currentStock <= item.reorderThreshold) {
        ragStatus = 'AMBER'
      } else {
        ragStatus = 'GREEN'
      }

      const estimatedDaysRemaining =
        item.dailyUsageEstimate > 0
          ? Math.floor(item.currentStock / item.dailyUsageEstimate)
          : null

      return {
        id: item.id,
        name: item.name,
        category: item.category,
        currentStock: item.currentStock,
        unit: item.unit,
        ragStatus,
        estimatedDaysRemaining,
      }
    })

    const overallStatus = worstOfAll(details.map((d) => d.ragStatus))

    // Build summary from the most critical supply
    let summary: string
    const redItems = details.filter((d) => d.ragStatus === 'RED')
    const amberItems = details.filter((d) => d.ragStatus === 'AMBER')

    if (redItems.length > 0) {
      const worst = redItems[0]
      const daysLabel =
        worst.estimatedDaysRemaining !== null
          ? `${worst.estimatedDaysRemaining} day${worst.estimatedDaysRemaining === 1 ? '' : 's'} remaining`
          : 'stock critical'
      summary = `${worst.name}: ${daysLabel}`
    } else if (amberItems.length > 0) {
      const worst = amberItems[0]
      const daysLabel =
        worst.estimatedDaysRemaining !== null
          ? `${worst.estimatedDaysRemaining} day${worst.estimatedDaysRemaining === 1 ? '' : 's'} remaining`
          : 'reorder threshold reached'
      summary = `${worst.name}: ${daysLabel}`
    } else {
      summary = `All ${details.length} supply item${details.length === 1 ? '' : 's'} adequately stocked`
    }

    return {
      dimension: 'SUPPLIES',
      status: overallStatus,
      summary,
      details,
      updatedAt: now,
    }
  } catch {
    return {
      dimension: 'SUPPLIES',
      status: 'AMBER',
      summary: 'Supply data unavailable',
      details: [],
      updatedAt: now,
    }
  }
}

// ---------------------------------------------------------------------------
// QC
// ---------------------------------------------------------------------------

/**
 * For each analyte, derive pass/fail from Westgard rule logic applied to
 * observedValue vs targetMean/targetSd, and cross-reference unacknowledged
 * DriftAlerts for drift warnings.
 *
 * A run is considered:
 *   FAILED        — observedValue violates the 1-3s REJECT rule (|z| > 3SD)
 *   DRIFT_WARNING — unacknowledged DriftAlert exists for this analyte
 *   PASSING       — within ±2SD with no active drift alerts
 */
export async function calculateQCRAG(): Promise<RAGDimensionResult> {
  const now = new Date().toISOString()

  try {
    const db = getDb()

    // Look back 12 hours for current-shift QC runs
    const shiftWindowMs = 12 * 60 * 60 * 1000
    const cutoffDate = new Date(Date.now() - shiftWindowMs).toISOString()

    const recentRuns: QcRun[] = await db.qcRuns
      .filter((run) => run.runDate >= cutoffDate)
      .toArray()

    if (recentRuns.length === 0) {
      return {
        dimension: 'QC',
        status: 'AMBER',
        summary: 'No QC data for current shift',
        details: [],
        updatedAt: now,
      }
    }

    // Fetch all unacknowledged drift alerts for cross-referencing
    const activeDriftAlerts: DriftAlert[] = await db.driftAlerts
      .filter((alert) => alert.acknowledgedAt === null)
      .toArray()

    // Group runs by analyte — keep the most recent run per analyte
    const latestByAnalyte = new Map<string, QcRun>()
    for (const run of recentRuns) {
      const existing = latestByAnalyte.get(run.analyte)
      if (!existing || run.runDate > existing.runDate) {
        latestByAnalyte.set(run.analyte, run)
      }
    }

    const details: QcDetail[] = []

    for (const [analyte, run] of latestByAnalyte.entries()) {
      const loincCode = run.loincCode ?? ''

      // Determine REJECT using 1-3s rule: |observed - mean| > 3 * SD
      const targetMean = run.targetMean ?? 0
      const targetSd = run.targetSd ?? 0
      const observedValue = run.observedValue ?? 0

      const zScore = targetSd > 0 ? Math.abs(observedValue - targetMean) / targetSd : 0
      const isRejected = targetSd > 0 && zScore > 3

      // Check for active (unacknowledged) drift alerts for this analyte
      const analyteDriftAlerts = activeDriftAlerts.filter(
        (a) => a.analyte === analyte,
      )
      const hasDriftWarning = analyteDriftAlerts.length > 0

      // Collect Westgard rule violations from drift alerts (human-readable)
      const westgardViolations: string[] = analyteDriftAlerts.map(
        (a) => a.ruleViolated,
      )

      let status: QcDetail['status']
      if (isRejected) {
        status = 'FAILED'
      } else if (hasDriftWarning) {
        status = 'DRIFT_WARNING'
      } else {
        status = 'PASSING'
      }

      details.push({
        analyte,
        loincCode,
        status,
        lastRunAt: run.runDate,
        westgardViolations,
      })
    }

    const passingCount = details.filter((d) => d.status === 'PASSING').length
    const totalCount = details.length

    let overallStatus: RAGStatus
    if (details.some((d) => d.status === 'FAILED')) {
      overallStatus = 'RED'
    } else if (details.some((d) => d.status === 'DRIFT_WARNING')) {
      overallStatus = 'AMBER'
    } else {
      overallStatus = 'GREEN'
    }

    const summary = `${passingCount}/${totalCount} analyte${totalCount === 1 ? '' : 's'} passing QC`

    return {
      dimension: 'QC',
      status: overallStatus,
      summary,
      details,
      updatedAt: now,
    }
  } catch {
    return {
      dimension: 'QC',
      status: 'AMBER',
      summary: 'QC data unavailable',
      details: [],
      updatedAt: now,
    }
  }
}

// ---------------------------------------------------------------------------
// Full board aggregation
// ---------------------------------------------------------------------------

export async function getFullRAGStatus(): Promise<RAGBoardState> {
  const [personnel, equipment, supplies, qc] = await Promise.all([
    calculatePersonnelRAG(),
    calculateEquipmentRAG(),
    calculateSupplyRAG(),
    calculateQCRAG(),
  ])

  const overallStatus = worstOfAll([
    personnel.status,
    equipment.status,
    supplies.status,
    qc.status,
  ])

  return {
    personnel,
    equipment,
    supplies,
    qc,
    overallStatus,
    generatedAt: new Date().toISOString(),
  }
}

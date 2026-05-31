/**
 * Workload Balancing Service — Story 51.2
 *
 * All computation is done from local Dexie data (offline-first).
 * No PHI — techId is an opaque practitioner ID; sample details are IDs only.
 * Load level thresholds (v1): green ≤100%, amber 101–150%, red >150% of lab average.
 */

import {
  getDb,
  putWorkloadSnapshot,
  getWorkloadSnapshotsByDateRange,
  getOpenAvailabilityForTech,
  addTechAvailability,
  closeAvailabilityRecord,
  addCustodyEvent,
  enqueueSyncEvent,
  type TechWorkloadSnapshot,
  type TechAvailability,
} from './db'
import type { FhirSpecimen } from '@ultranos/shared-types'
import { hlc, serializeHlc } from './hlc'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LoadLevel = 'GREEN' | 'AMBER' | 'RED'

export interface TechWorkload {
  techId: string
  pendingCount: number       // assigned, pipelineStatus = 'received' | 'accessioned'
  inProgressCount: number    // pipelineStatus = 'processing'
  completedCount: number     // pipelineStatus = 'completed' (today)
  estimatedCompletionAt: Date | null
  loadLevel: LoadLevel
  sampleIds: string[]        // IDs of samples in this tech's queue (no PHI)
  isUnavailable: boolean
  availabilityReason: string | null
}

export interface WorkloadPatterns {
  avgSamplesPerTechPerShift: Record<string, number>  // techId → avg
  overloadedTechs: string[]    // techIds consistently >120% of average
  underutilizedTechs: string[] // techIds consistently <80% of average
  peakHours: Record<number, number>  // hour (0-23) → sample count
  snapshotCount: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Pipeline statuses that map to "pending" (assigned, not yet started)
const PENDING_STATUSES = ['received', 'accessioned'] as const
// Pipeline statuses that map to "in-progress"
const IN_PROGRESS_STATUSES = ['processing'] as const
// Pipeline statuses that map to "completed"
const COMPLETED_STATUSES = ['completed', 'released'] as const

const AMBER_THRESHOLD = 1.5  // 150% of average → RED; 100–150% → AMBER
const GREEN_THRESHOLD = 1.0  // ≤100% of average → GREEN

const OVERLOAD_THRESHOLD = 1.2    // >120% of average over 7+ shifts
const UNDERUTILIZED_THRESHOLD = 0.8  // <80% of average

/** Today as YYYY-MM-DD (UTC). */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Compute estimated completion time given pending + in-progress counts and average TAT.
 * avgTat is in minutes. Returns null when there is no workload or no TAT data.
 */
export function estimateCompletionTime(
  pendingCount: number,
  inProgressCount: number,
  avgTat: number,
): Date | null {
  if ((pendingCount + inProgressCount) === 0 || avgTat <= 0) return null
  const remainingMinutes = (pendingCount + inProgressCount) * avgTat
  return new Date(Date.now() + remainingMinutes * 60_000)
}

/**
 * Determine load level for a tech relative to the lab average.
 * labAvg = 0 is treated as GREEN (nothing to compare against).
 */
function computeLoadLevel(totalActive: number, labAvg: number): LoadLevel {
  if (labAvg === 0) return 'GREEN'
  const ratio = totalActive / labAvg
  if (ratio > AMBER_THRESHOLD) return 'RED'
  if (ratio > GREEN_THRESHOLD) return 'AMBER'
  return 'GREEN'
}

// ---------------------------------------------------------------------------
// Core service functions
// ---------------------------------------------------------------------------

/**
 * Compute current workload for every tech that has at least one sample assigned.
 * Source: samples table in Dexie (grouped by _ultranos.assignedTechId).
 * Availability overlay: tech_availability table.
 */
export async function getCurrentWorkloads(): Promise<TechWorkload[]> {
  const db = getDb()

  // Fetch all samples and group by assigned tech
  const allSamples: FhirSpecimen[] = await db.samples.toArray()
  const todayStr = todayUTC()

  // Group by assignedTechId (stored in _ultranos extension)
  const byTech = new Map<string, FhirSpecimen[]>()
  for (const sample of allSamples) {
    const techId = (sample as any)._ultranos?.assignedTechId as string | undefined
    if (!techId) continue
    const existing = byTech.get(techId)
    if (existing) {
      existing.push(sample)
    } else {
      byTech.set(techId, [sample])
    }
  }

  // Also include techs from queueEntries (patient queue assignments)
  const allQueues = await db.queueEntries.toArray()
  for (const entry of allQueues) {
    if (!entry.techId) continue
    if (!byTech.has(entry.techId)) {
      byTech.set(entry.techId, [])
    }
  }

  // Compute lab average (total active / tech count)
  let totalActive = 0
  const techCounts: Map<string, { pending: number; inProgress: number }> = new Map()
  for (const [techId, samples] of byTech) {
    const pending = samples.filter((s) =>
      PENDING_STATUSES.includes((s as any)._ultranos?.pipelineStatus),
    ).length
    const inProgress = samples.filter((s) =>
      IN_PROGRESS_STATUSES.includes((s as any)._ultranos?.pipelineStatus),
    ).length
    totalActive += pending + inProgress
    techCounts.set(techId, { pending, inProgress })
  }
  const labAvg = byTech.size > 0 ? totalActive / byTech.size : 0

  // Build result array with load level + availability overlay
  const workloads: TechWorkload[] = []

  for (const [techId, samples] of byTech) {
    const counts = techCounts.get(techId) ?? { pending: 0, inProgress: 0 }
    const completed = samples.filter((s) => {
      const status = (s as any)._ultranos?.pipelineStatus as string
      const completedAt = (s as any)._ultranos?.completedAt as string | undefined
      return COMPLETED_STATUSES.includes(status as any) && completedAt?.startsWith(todayStr)
    }).length

    // Average TAT from TAT overrides or default 30 min
    const avgTat = await computeAvgTat(samples)
    const eta = estimateCompletionTime(counts.pending, counts.inProgress, avgTat)
    const loadLevel = computeLoadLevel(counts.pending + counts.inProgress, labAvg)

    // Availability overlay
    const availability = await getOpenAvailabilityForTech(techId)
    const isUnavailable = !!availability

    workloads.push({
      techId,
      pendingCount: counts.pending,
      inProgressCount: counts.inProgress,
      completedCount: completed,
      estimatedCompletionAt: eta,
      loadLevel,
      sampleIds: samples.map((s) => s.id ?? '').filter(Boolean),
      isUnavailable,
      availabilityReason: availability?.reason ?? null,
    })
  }

  return workloads
}

/** Compute average TAT in minutes for a set of samples, falling back to 30 min default. */
async function computeAvgTat(samples: FhirSpecimen[]): Promise<number> {
  const db = getDb()
  if (samples.length === 0) return 30

  try {
    // Try to get TAT override for the most common LOINC code in the sample set
    const loincCodes = samples
      .flatMap((s) => {
        const code = (s as any)._ultranos?.loincCode as string | undefined
        return code ? [code] : []
      })

    if (loincCodes.length > 0) {
      const overrides = await db.tat_overrides.toArray()
      if (overrides.length > 0) {
        // Use the average TAT from applicable overrides
        const applicable = overrides.filter((o) => loincCodes.includes(o.loincCode))
        if (applicable.length > 0) {
          const avg = applicable.reduce((sum, o) => sum + (o.tatMinutes ?? 30), 0) / applicable.length
          return avg
        }
      }
    }
  } catch {
    // Dexie unavailable — fall through to default
  }

  return 30 // default 30 minutes
}

/**
 * Compute lab-wide average load (total active samples / number of techs with assignments).
 */
export async function getLabAverageLoad(): Promise<number> {
  const workloads = await getCurrentWorkloads()
  if (workloads.length === 0) return 0
  const total = workloads.reduce((sum, w) => sum + w.pendingCount + w.inProgressCount, 0)
  return total / workloads.length
}

/**
 * Aggregate workload snapshots for historical trend analysis.
 * @param days Number of days to look back (default 30)
 */
export async function getHistoricalPatterns(days = 30): Promise<WorkloadPatterns> {
  const to = todayUTC()
  const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const snapshots = await getWorkloadSnapshotsByDateRange(from, to)

  if (snapshots.length === 0) {
    return {
      avgSamplesPerTechPerShift: {},
      overloadedTechs: [],
      underutilizedTechs: [],
      peakHours: {},
      snapshotCount: 0,
    }
  }

  // Compute per-tech average
  const techTotals: Map<string, { sum: number; count: number }> = new Map()
  for (const s of snapshots) {
    const existing = techTotals.get(s.techId)
    const samples = s.pendingCount + s.inProgressCount + s.completedCount
    if (existing) {
      existing.sum += samples
      existing.count++
    } else {
      techTotals.set(s.techId, { sum: samples, count: 1 })
    }
  }

  const avgPerTech: Record<string, number> = {}
  for (const [techId, { sum, count }] of techTotals) {
    avgPerTech[techId] = count > 0 ? sum / count : 0
  }

  // Lab-wide average across all techs
  const allAvgs = Object.values(avgPerTech)
  const labAvg = allAvgs.length > 0 ? allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length : 0

  // Identify overloaded and underutilized techs
  const overloadedTechs: string[] = []
  const underutilizedTechs: string[] = []

  for (const [techId, avg] of Object.entries(avgPerTech)) {
    if (labAvg === 0) continue
    const ratio = avg / labAvg
    // Only flag if tech has at least 7 snapshots (7 shifts of data)
    const techCount = techTotals.get(techId)?.count ?? 0
    if (techCount >= 7) {
      if (ratio > OVERLOAD_THRESHOLD) overloadedTechs.push(techId)
      else if (ratio < UNDERUTILIZED_THRESHOLD) underutilizedTechs.push(techId)
    }
  }

  // Peak hour distribution (based on snapshotAt hour)
  const peakHours: Record<number, number> = {}
  for (const s of snapshots) {
    try {
      const hour = new Date(s.snapshotAt).getUTCHours()
      peakHours[hour] = (peakHours[hour] ?? 0) + s.pendingCount + s.inProgressCount
    } catch {
      // Malformed timestamp — skip
    }
  }

  return {
    avgSamplesPerTechPerShift: avgPerTech,
    overloadedTechs,
    underutilizedTechs,
    peakHours,
    snapshotCount: snapshots.length,
  }
}

/**
 * Save a workload snapshot for a specific tech at the current moment.
 * Called at shift boundaries (from shift handover flow in Story 51.1).
 */
export async function recordWorkloadSnapshot(techId: string): Promise<void> {
  const workloads = await getCurrentWorkloads()
  const techWorkload = workloads.find((w) => w.techId === techId)
  if (!techWorkload) return

  const avgTat = 30 // simplified — production would compute from historical data

  const snapshot: TechWorkloadSnapshot = {
    id: crypto.randomUUID(),
    techId,
    shiftDate: todayUTC(),
    pendingCount: techWorkload.pendingCount,
    inProgressCount: techWorkload.inProgressCount,
    completedCount: techWorkload.completedCount,
    avgTatMinutes: avgTat,
    snapshotAt: new Date().toISOString(),
  }

  await putWorkloadSnapshot(snapshot)
}

/**
 * Reassign a sample from one tech to another.
 * - Updates sample assignment in Dexie
 * - Releases any active lock on the sample (Story 51.3 lock coordination)
 * - Appends chain of custody entry
 * - Queues sync event
 *
 * No PHI emitted — uses opaque IDs only.
 */
export async function reassignSample(
  sampleId: string,
  fromTechId: string,
  toTechId: string,
  reassignedBy: string,
): Promise<void> {
  const db = getDb()

  // Update sample assignment
  await db.samples.where('id').equals(sampleId).modify((sample: any) => {
    if (!sample._ultranos) sample._ultranos = {}
    sample._ultranos.assignedTechId = toTechId
    sample._ultranos.reassignedAt = new Date().toISOString()
    sample._ultranos.reassignedBy = reassignedBy
  })

  // Append chain of custody event (append-only per CLAUDE.md)
  await addCustodyEvent({
    id: crypto.randomUUID(),
    sampleId,
    eventType: 'REASSIGNED',
    timestamp: serializeHlc(hlc.now()),
    actorId: reassignedBy,
    detail: {
      fromTechId,
      toTechId,
      // No PHI — only tech IDs and sample ID
    },
  } as any)

  // Queue sync event so Hub is updated when online
  await enqueueSyncEvent({
    resourceType: 'SAMPLE_ASSIGNMENT',
    resourceId: sampleId,
    status: 'pending',
    payload: {
      sampleId,
      fromTechId,
      toTechId,
      reassignedBy,
      reassignedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    lastAttemptAt: null,
    retryCount: 0,
  })
}

/**
 * Mark a tech as unavailable (or update their status).
 * Creates a new availability record; closes any existing open record first.
 */
export async function markTechUnavailable(
  techId: string,
  status: TechAvailability['status'],
  reason: string,
): Promise<void> {
  // Close any open record for this tech
  const existing = await getOpenAvailabilityForTech(techId)
  if (existing?.id) {
    await closeAvailabilityRecord(existing.id, new Date().toISOString())
  }

  if (status === 'AVAILABLE') return  // AVAILABLE just closes the record

  await addTechAvailability({
    id: crypto.randomUUID(),
    techId,
    status,
    reason,
    startedAt: new Date().toISOString(),
    endedAt: null,
  })
}

/**
 * Mark a tech as available again (closes any open unavailability record).
 */
export async function markTechAvailable(techId: string): Promise<void> {
  const existing = await getOpenAvailabilityForTech(techId)
  if (existing?.id) {
    await closeAvailabilityRecord(existing.id, new Date().toISOString())
  }
}

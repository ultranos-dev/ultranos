// ---------------------------------------------------------------------------
// Story 50.4 — Daily Activity Log Aggregator
// Reads from local Dexie tables to produce aggregate statistics for the day.
// No PHI is read, stored, or returned — only counts, durations, and categories.
// Offline-capable: reads exclusively from local Dexie tables.
// ---------------------------------------------------------------------------

import { getDb } from './db'
import type {
  DailyActivityLog,
  TestTypeSummary,
  WorkflowMetrics,
  TurnaroundTimeStats,
  RejectionSummary,
  EquipmentStatusEntry,
} from './daily-log-types'

/** Aggregate all available daily data for the given ISO date (YYYY-MM-DD). */
export async function aggregateDailyData(
  date: string,
  generatedBy: string,
  facilityName: string,
): Promise<Omit<DailyActivityLog, 'id' | 'imageBlob' | 'imageHash' | 'status'>> {
  const db = getDb()
  // Use local-midnight anchors (not UTC) so aggregation matches the lab's operating day
  const dayStart = `${date}T00:00:00`
  const dayEnd = `${date}T23:59:59.999`

  // ---------------------------------------------------------------------------
  // Test summary — from uploadQueue (most commonly populated in lab-lite)
  // Groups by loincCode/loincDisplay and counts entries received on this date.
  // ---------------------------------------------------------------------------
  const queueEntries = await db.uploadQueue
    .filter(
      (e) => {
        // Normalise to date-only comparison to handle both UTC and local timestamps
        const entryDate = (e.queuedAt ?? '').slice(0, 10)
        return entryDate === date
      },
    )
    .toArray()

  const testMap = new Map<string, { label: string; total: number; positive: number; negative: number }>()
  for (const entry of queueEntries) {
    const code = entry.metadata.loincCode
    const label = entry.metadata.loincDisplay
    const existing = testMap.get(code) ?? { label, total: 0, positive: 0, negative: 0 }
    existing.total += 1
    testMap.set(code, existing)
  }

  // If samples table is available, supplement with structured sample data.
  // De-duplicate: track queue entry IDs to avoid counting a sample in both tables.
  const queueSampleIds = new Set(queueEntries.map((e) => e.metadata?.sampleId).filter(Boolean))
  let sampleEntries: any[] = []
  try {
    sampleEntries = await db.samples
      .filter((s: any) => {
        const ts: string = s.meta?.lastUpdated ?? s.receivedDateTime ?? ''
        const entryDate = ts.slice(0, 10)
        return entryDate === date
      })
      .toArray()
    // Remove samples already counted via uploadQueue
    sampleEntries = sampleEntries.filter((s: any) => !queueSampleIds.has(s.id))
  } catch {
    // samples table may not be available in all versions — graceful fallback
  }

  // Merge sample-based test counts into testMap
  for (const sample of sampleEntries) {
    const code: string = sample.type?.coding?.[0]?.code ?? 'UNKNOWN'
    const label: string = sample.type?.coding?.[0]?.display ?? 'Unknown Test'
    const existing = testMap.get(code) ?? { label, total: 0, positive: 0, negative: 0 }
    existing.total += 1
    testMap.set(code, existing)
  }

  const testSummary: TestTypeSummary[] = Array.from(testMap.entries()).map(([loincCode, data]) => ({
    loincCode,
    testLabel: data.label,
    totalPerformed: data.total,
    totalPositive: data.positive,
    totalNegative: data.negative,
  }))

  // ---------------------------------------------------------------------------
  // Workflow metrics — derived from queue entries for the day
  // ---------------------------------------------------------------------------
  const samplesReceived = queueEntries.length + sampleEntries.length
  const samplesCompleted = queueEntries.filter(
    (e) => e.status === 'uploading' || e.status === 'expired',
  ).length

  // From structured samples: count those with authorized status
  let samplesAuthorized = 0
  try {
    const authorized = sampleEntries.filter(
      (s: any) => s._ultranos?.pipelineStatus === 'authorized',
    )
    samplesAuthorized = authorized.length
  } catch {
    samplesAuthorized = 0
  }

  const totalCompleted = samplesCompleted + samplesAuthorized
  const samplesPending = Math.max(0, samplesReceived - totalCompleted)
  const completionRate =
    samplesReceived > 0 ? Math.round((totalCompleted / samplesReceived) * 1000) / 10 : 0

  const workflowMetrics: WorkflowMetrics = {
    samplesReceived,
    samplesCompleted: totalCompleted,
    samplesPending,
    completionRate,
  }

  // ---------------------------------------------------------------------------
  // Turnaround time — from custody events on samples received/completed today
  // Falls back to 0 stats if no timing data is available.
  // ---------------------------------------------------------------------------
  const turnaroundTime = await calculateTurnaroundTime(date)

  // ---------------------------------------------------------------------------
  // Rejections — from samples or upload queue
  // ---------------------------------------------------------------------------
  const rejections = await aggregateRejections(date)

  // ---------------------------------------------------------------------------
  // Stockout alerts — from reagent_inventory: active reagents at 0 remaining
  // ---------------------------------------------------------------------------
  const stockoutAlerts = await getStockoutAlerts()

  // ---------------------------------------------------------------------------
  // Equipment status — not tracked in lab-lite DB yet; mark as manual entry
  // ---------------------------------------------------------------------------
  const equipmentStatus: EquipmentStatusEntry[] = []

  return {
    logDate: date,
    facilityName,
    generatedAt: new Date().toISOString(),
    generatedBy,
    testSummary,
    workflowMetrics,
    turnaroundTime,
    rejections,
    stockoutAlerts,
    equipmentStatus,
  }
}

/** Calculate turnaround time stats from custody events (received → authorized/completed). */
async function calculateTurnaroundTime(date: string): Promise<TurnaroundTimeStats> {
  const db = getDb()
  try {
    // Get all custody events from this day (date-only comparison for timezone safety)
    const events = await db.custody_events
      .filter((e: any) => (e.timestamp ?? '').slice(0, 10) === date)
      .toArray()

    // Group by sampleId to find RECEIVED and AUTHORIZED/COMPLETED pairs
    const bySample = new Map<string, { received?: string; completed?: string }>()
    for (const evt of events) {
      const entry = bySample.get(evt.sampleId) ?? {}
      if (evt.eventType === 'RECEIVED' || evt.eventType === 'ACCESSIONED') {
        entry.received = evt.timestamp
      } else if (
        evt.eventType === 'AUTHORIZED' ||
        evt.eventType === 'COMPLETED' ||
        evt.eventType === 'RELEASED'
      ) {
        entry.completed = evt.timestamp
      }
      bySample.set(evt.sampleId, entry)
    }

    const durations: number[] = []
    for (const { received, completed } of Array.from(bySample.values())) {
      if (received && completed) {
        const start = new Date(received).getTime()
        const end = new Date(completed).getTime()
        if (end > start) {
          durations.push((end - start) / (1000 * 60 * 60)) // hours
        }
      }
    }

    if (durations.length === 0) {
      return { minHours: 0, avgHours: 0, maxHours: 0, sampleCount: 0 }
    }

    const minHours = Math.round(Math.min(...durations) * 10) / 10
    const maxHours = Math.round(Math.max(...durations) * 10) / 10
    const avgHours =
      Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10

    return { minHours, avgHours, maxHours, sampleCount: durations.length }
  } catch {
    return { minHours: 0, avgHours: 0, maxHours: 0, sampleCount: 0 }
  }
}

/** Aggregate rejection counts and reasons from samples table. */
async function aggregateRejections(date: string): Promise<RejectionSummary> {
  const db = getDb()
  try {
    const rejected = await db.samples
      .filter(
        (s: any) =>
          s.status === 'unsatisfactory' &&
          (s.meta?.lastUpdated ?? '').slice(0, 10) === date,
      )
      .toArray()

    const reasonMap = new Map<string, number>()
    for (const sample of rejected) {
      const reason: string =
        sample._ultranos?.rejectionReason ??
        sample.condition?.[0]?.coding?.[0]?.code ??
        'other'
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
    }

    const reasons = Array.from(reasonMap.entries()).map(([reason, count]) => ({ reason, count }))
    return { totalRejected: rejected.length, reasons }
  } catch {
    return { totalRejected: 0, reasons: [] }
  }
}

/** Return list of reagent names where stockout is detected (active with 0 expected remaining). */
async function getStockoutAlerts(): Promise<string[]> {
  const db = getDb()
  try {
    const active = await db.reagent_inventory
      .where('status')
      .equals('ACTIVE')
      .toArray()

    return active
      .filter((r) => r.testsPerformed >= r.expectedTests)
      .map((r) => r.name)
  } catch {
    return []
  }
}

import type { InfectionControlAudit, InspectionReadinessPack } from '@/types/infection-control-audit'
import type { WasteSummary } from '@/types/waste-tracking'
import { getAuditHistory } from '@/lib/db'
import { reportInfectionControlAuditEvent } from '@/lib/audit-client'

/**
 * Collect all YYYY-MM month strings that fall within a start/end date range (inclusive).
 * Both start and end are expected to be YYYY-MM-DD strings.
 */
function getMonthsInRange(start: string, end: string): Array<{ year: number; month: number }> {
  const months: Array<{ year: number; month: number }> = []
  const startDate = new Date(start)
  const endDate = new Date(end)

  // Clamp to the first of each month for iteration
  const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1))
  const endMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1))

  while (cursor <= endMonth) {
    months.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months
}

/**
 * Generate an Inspection Readiness Pack covering a date range.
 *
 * Aggregates infection control audit results, waste summaries, temperature
 * compliance, and spill incident data into a single exportable document.
 *
 * This function never throws — all data sources are collected with graceful
 * degradation. Sections that fail or are not yet implemented are reported in
 * `missingSections` rather than aborting the entire pack.
 *
 * No PHI is included — infection control audits contain only practitioner IDs
 * and operational compliance scores (CLAUDE.md Rule #7).
 */
export async function generateInspectionPack(
  dateRange: { start: string; end: string },
): Promise<InspectionReadinessPack> {
  const availableSections: string[] = []
  const missingSections: string[] = []

  // ------------------------------------------------------------------
  // 1. Audit results — always available (same story, same db)
  // ------------------------------------------------------------------
  let auditResults: InfectionControlAudit[] = []
  try {
    const allAudits = await getAuditHistory(1000)
    auditResults = allAudits.filter(
      (a) => a.auditDate >= dateRange.start && a.auditDate <= dateRange.end,
    )
    availableSections.push('auditResults')
  } catch {
    // getAuditHistory should never throw in normal circumstances, but degrade safely
    missingSections.push('auditResults')
  }

  // ------------------------------------------------------------------
  // 2. Waste summaries — Story 47.2 (generateMonthlySummary exists)
  // ------------------------------------------------------------------
  let wasteSummaries: WasteSummary[] = []
  try {
    const { generateMonthlySummary } = await import('@/lib/safety/waste-summary')
    const months = getMonthsInRange(dateRange.start, dateRange.end)
    const results = await Promise.allSettled(
      months.map(({ year, month }) => generateMonthlySummary(year, month)),
    )
    for (const result of results) {
      if (result.status === 'fulfilled') {
        wasteSummaries.push(result.value)
      }
    }
    availableSections.push('wasteSummaries')
  } catch {
    missingSections.push('wasteSummaries')
    wasteSummaries = []
  }

  // ------------------------------------------------------------------
  // 3. Temperature compliance — Story 47.4
  //    No temperature tables exist in Dexie (db.ts has no temperature_readings
  //    or temperature_excursions tables), so degrade gracefully.
  // ------------------------------------------------------------------
  let temperatureCompliance = { totalReadings: 0, excursionCount: 0, excursionRate: 0 }
  try {
    // Dynamically attempt to import temperature service; if tables don't exist
    // the query will throw, which we catch below.
    const { getDb } = await import('@/lib/db')
    const db = getDb()

    // Type assertion needed: temperature tables are not in the typed schema.
    // If they don't exist, accessing them will throw at runtime and we degrade.
    const dbAny = db as unknown as Record<string, { toArray: () => Promise<Array<{ recordedAt?: string; startedAt?: string }>> }>

    if (!('temperature_readings' in db) || !('temperature_excursions' in db)) {
      throw new Error('temperature tables not available')
    }

    const allReadings = await dbAny['temperature_readings'].toArray()
    const allExcursions = await dbAny['temperature_excursions'].toArray()

    const readings = allReadings.filter(
      (r) =>
        r.recordedAt !== undefined &&
        r.recordedAt >= dateRange.start &&
        r.recordedAt <= dateRange.end + 'T23:59:59.999Z',
    )

    const excursions = allExcursions.filter(
      (e) =>
        e.startedAt !== undefined &&
        e.startedAt >= dateRange.start &&
        e.startedAt <= dateRange.end + 'T23:59:59.999Z',
    )

    const totalReadings = readings.length
    const excursionCount = excursions.length
    const excursionRate = totalReadings > 0 ? excursionCount / totalReadings : 0

    temperatureCompliance = { totalReadings, excursionCount, excursionRate }
    availableSections.push('temperatureCompliance')
  } catch {
    missingSections.push('temperatureCompliance')
    temperatureCompliance = { totalReadings: 0, excursionCount: 0, excursionRate: 0 }
  }

  // ------------------------------------------------------------------
  // 4. Spill incidents — Story 47.5 (NOT yet implemented)
  // ------------------------------------------------------------------
  missingSections.push('spillIncidents')
  const spillIncidents: unknown[] = []

  // ------------------------------------------------------------------
  // 5. Overall compliance score — average of non-null audit scores
  // ------------------------------------------------------------------
  const scoredAudits = auditResults.filter((a) => a.complianceScore !== null)
  const overallComplianceScore =
    scoredAudits.length > 0
      ? scoredAudits.reduce((sum, a) => sum + (a.complianceScore ?? 0), 0) / scoredAudits.length
      : 0

  // ------------------------------------------------------------------
  // 6. Emit audit event — fire-and-forget, never blocks return
  // ------------------------------------------------------------------
  try {
    reportInfectionControlAuditEvent({
      action: 'INSPECTION_PACK_GENERATED',
      auditId: 'inspection-pack',
      auditMonth: dateRange.start.slice(0, 7),
      conductedBy: 'system',
    })
  } catch {
    // Audit emission must never throw or block the pack generation
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange,
    auditResults,
    wasteSummaries,
    temperatureCompliance,
    spillIncidents,
    overallComplianceScore,
    availableSections,
    missingSections,
  }
}

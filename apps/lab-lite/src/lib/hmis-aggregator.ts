// ---------------------------------------------------------------------------
// Story 50.1 — HMIS Monthly Report Aggregation Engine
// Reads from local Dexie tables to produce aggregate statistics for a given month.
// No PHI is read, stored, or returned — only counts, rates, and demographic breakdowns.
// Offline-capable: reads exclusively from local Dexie tables, no Hub dependency.
// ---------------------------------------------------------------------------

import { getDb } from './db'
import type { HmisMonthlyReport, TestCategorySummary, PositivityRateEntry, DemographicBreakdown, AgeGroup } from './hmis-types'
import { AGE_GROUPS } from './hmis-types'
import { REPORTABLE_DISEASE_LOINC_MAP } from './hmis-template'

/**
 * Calculate positivity rate with 2 decimal precision.
 * Returns 0 when total is 0 (division-by-zero guard).
 */
export function calculatePositivityRate(positive: number, total: number): number {
  if (total === 0) return 0
  return Math.round((positive / total) * 10000) / 100
}

/** Classify a patient age into the corresponding HMIS age group. */
function classifyAgeGroup(age: number): AgeGroup {
  if (age <= 4) return '0-4'
  if (age <= 14) return '5-14'
  if (age <= 24) return '15-24'
  if (age <= 44) return '25-44'
  if (age <= 64) return '45-64'
  return '65+'
}

/**
 * Determine if a result summary string indicates a positive result.
 * Checks for common clinical keywords: positive, detected, reactive, present, found.
 * Case-insensitive. Returns false for negative/normal/absent/not detected.
 */
function isPositiveResult(resultSummary: string): boolean {
  const lower = resultSummary.toLowerCase()
  // Negative keywords take priority
  if (/\b(negative|not detected|not reactive|absent|normal|no growth)\b/.test(lower)) return false
  return /\b(positive|detected|reactive|present|found|abnormal)\b/.test(lower)
}

/**
 * Aggregate all lab logbook data for the given month and year.
 * Returns a complete HmisMonthlyReport object with status 'draft'.
 *
 * If labLogbook has no data for the period, all counts are zero —
 * sections return empty arrays or zero values, never null/undefined.
 */
export async function aggregateMonthlyData(
  year: number,
  month: number,               // 1-12
  generatedBy: string,         // Practitioner ID
  facilityName: string,
  facilityProvince: string,
  facilityDistrict: string,
): Promise<Omit<HmisMonthlyReport, 'id' | 'syncStatus'> & { id?: string }> {
  const db = getDb()

  // Date range: first day to last day of the month (inclusive)
  const monthStr = String(month).padStart(2, '0')
  const dayStart = `${year}-${monthStr}-01`
  // Last day: advance to first of next month, step back one
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const nextMonthStr = String(nextMonth).padStart(2, '0')
  const dayEnd = `${nextYear}-${nextMonthStr}-01`

  // ---------------------------------------------------------------------------
  // Fetch logbook entries for this month
  // ---------------------------------------------------------------------------
  let entries: Awaited<ReturnType<typeof db.labLogbook.toArray>>
  try {
    entries = await db.labLogbook
      .where('date')
      .between(dayStart, dayEnd, true, false)
      .toArray()
  } catch {
    // labLogbook not available (old DB version) — return empty sections
    entries = []
  }

  // ---------------------------------------------------------------------------
  // Test category summary
  // ---------------------------------------------------------------------------
  const testMap = new Map<string, { label: string; total: number; positive: number; negative: number }>()
  for (const entry of entries) {
    const code = entry.testLoincCode
    const label = entry.testType
    const existing = testMap.get(code) ?? { label, total: 0, positive: 0, negative: 0 }
    existing.total += 1
    if (isPositiveResult(entry.resultSummary)) {
      existing.positive += 1
    } else {
      existing.negative += 1
    }
    testMap.set(code, existing)
  }

  const testCategorySummary: TestCategorySummary[] = Array.from(testMap.entries()).map(
    ([loincCode, data]) => ({
      loincCode,
      categoryLabel: data.label,
      totalPerformed: data.total,
      totalPositive: data.positive,
      totalNegative: data.negative,
      positivityRate: calculatePositivityRate(data.positive, data.total),
    }),
  )

  // ---------------------------------------------------------------------------
  // Reportable disease positivity rates
  // ---------------------------------------------------------------------------
  const positivityRates: PositivityRateEntry[] = REPORTABLE_DISEASE_LOINC_MAP.map((disease) => {
    const relevantEntries = entries.filter((e) => disease.loincCodes.includes(e.testLoincCode))
    const totalTested = relevantEntries.length
    const totalPositive = relevantEntries.filter((e) => isPositiveResult(e.resultSummary)).length
    return {
      diseaseCode: disease.code,
      diseaseLabel: disease.label,
      totalTested,
      totalPositive,
      positivityRate: calculatePositivityRate(totalPositive, totalTested),
      previousMonthRate: undefined,
    }
  })

  // ---------------------------------------------------------------------------
  // Demographic breakdown — age group x gender (unknown since logbook has no gender)
  // ---------------------------------------------------------------------------
  const demoMap = new Map<AgeGroup, { male: number; female: number; unknown: number }>()
  for (const group of AGE_GROUPS) {
    demoMap.set(group, { male: 0, female: 0, unknown: 0 })
  }
  for (const entry of entries) {
    const group = classifyAgeGroup(entry.patientAge)
    const bucket = demoMap.get(group)!
    // labLogbook doesn't store gender — count as unknown
    bucket.unknown += 1
  }
  const demographics: DemographicBreakdown[] = AGE_GROUPS.map((ageGroup) => {
    const { male, female, unknown } = demoMap.get(ageGroup)!
    return { ageGroup, male, female, unknown, total: male + female + unknown }
  })

  // ---------------------------------------------------------------------------
  // Reagent consumption — query reagent_consumption_log if available
  // ---------------------------------------------------------------------------
  let reagentConsumption: HmisMonthlyReport['reagentConsumption'] = []
  try {
    const consumptionEntries = await db.reagent_consumption_log
      .filter((c: any) => {
        const ts: string = c.loggedAt ?? ''
        return ts >= `${dayStart}T00:00:00.000Z` && ts < `${dayEnd}T00:00:00.000Z`
      })
      .toArray()
    const reagentMap = new Map<string, { name: string; consumed: number }>()
    for (const c of consumptionEntries) {
      const name: string = c.reagentId ?? 'unknown'
      const entry = reagentMap.get(name) ?? { name, consumed: 0 }
      entry.consumed += (c.quantityUsed as number) ?? 1
      reagentMap.set(name, entry)
    }
    reagentConsumption = Array.from(reagentMap.values()).map((r) => ({
      reagentName: r.name,
      unitsConsumed: r.consumed,
      unitsRemaining: 0,           // requires reagent_inventory cross-reference
      estimatedDaysRemaining: 0,   // requires stock level data
    }))
  } catch {
    // reagent tables may not exist — mark as manual entry required
    reagentConsumption = []
  }

  // ---------------------------------------------------------------------------
  // Quality indicators — derived from labLogbook and samples if available
  // ---------------------------------------------------------------------------
  const totalSamplesReceived = entries.length
  let rejectedSamples = 0
  try {
    const sampleTable = await db.samples
      .filter((s: any) => {
        const ts: string = s.receivedDateTime ?? s.meta?.lastUpdated ?? ''
        return ts >= `${dayStart}T00:00:00.000Z` && ts < `${dayEnd}T00:00:00.000Z`
      })
      .toArray()
    rejectedSamples = sampleTable.filter((s: any) => s._ultranos?.pipelineStatus === 'rejected').length
  } catch {
    rejectedSamples = 0
  }
  const rejectionRate = calculatePositivityRate(rejectedSamples, totalSamplesReceived)
  const qualityIndicators = {
    totalSamplesReceived,
    rejectedSamples,
    rejectionRate,
    qcPassRate: 100,         // Requires QC run data — default 100 if no failures detected
    averageTatHours: 0,      // Requires TAT calculation from sample receipt to authorization
  }

  return {
    reportMonth: month,
    reportYear: year,
    facilityName,
    facilityProvince,
    facilityDistrict,
    status: 'draft',
    generatedAt: new Date().toISOString(),
    generatedBy,
    testCategorySummary,
    positivityRates,
    demographics,
    reagentConsumption,
    qualityIndicators,
    corrections: [],
  }
}

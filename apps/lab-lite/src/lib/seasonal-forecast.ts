/**
 * Story 54.6 — 30-Day Seasonal Operations Forecast
 *
 * Generates a comprehensive SeasonalPlan covering four domains:
 *   1. Power forecast — analyzer hours, solar vs generator needs
 *   2. Reagent forecast — projected consumption, depletion dates, reorder deadlines
 *   3. Staffing forecast — shift adjustments based on projected volume
 *   4. Protocol recommendations — QC schedule, worklist, batch processing
 *
 * Integration with Story 48.2 predictive burndown: if a burndown projection
 * module is found at runtime, it is used for reagent projections; otherwise
 * linear projection from pattern multipliers is used.
 *
 * NO PHI — all forecasts use aggregate counts, reagent codes, and operational
 * metrics. No patient identifiers appear anywhere in this module.
 */

import { v4 as uuidv4 } from 'uuid'
import { hlc, serializeHlc } from './hlc'
import { getDb } from './db'
import type {
  SeasonalDemandPattern,
  SeasonalPlan,
  PowerForecast,
  ReagentForecast,
  ReagentForecastItem,
  StaffingForecast,
  ProtocolRecommendation,
  LabForecastConfig,
  SurgeAlert,
} from '@/types/seasonal-planner'
import type { ReagentInventoryEntry } from './db'

const DEFAULT_CONFIG: LabForecastConfig = {
  testsPerTechPerHour: 4,
  currentStaffCount: 3,
  supplierLeadTimeDays: 14,
  hrLeadTimeDays: 14,
  fuelLeadTimeDays: 7,
  reagentSafetyBufferDays: 7,
  solarHoursPerDay: null,
  analyzerHoursPerTest: 0.25,
  generatorLitersPerHour: 0.5,
  labName: 'Lab',
}

/** Number of days in the plan period. */
const PLAN_DAYS = 30

/**
 * Compute the average daily test volume expected during the plan period,
 * taking surge multipliers into account.
 */
function computeProjectedDailyTests(
  patterns: SeasonalDemandPattern[],
  surgeAlerts: SurgeAlert[],
): number {
  if (patterns.length === 0) return 20  // conservative default

  // Find the ALL pattern if present, otherwise sum all categories
  const allPattern = patterns.find((p) => p.testCategory === 'ALL')
  const today = new Date()
  const planMonth = today.getMonth() // 0-indexed

  let baseline: number
  if (allPattern) {
    baseline = allPattern.monthlyBaseline[planMonth] ?? 20
  } else {
    baseline = patterns.reduce((sum, p) => sum + (p.monthlyBaseline[planMonth] ?? 0), 0)
  }

  if (baseline === 0) baseline = 20

  // Apply surge multiplier if any active surge overlaps the plan period
  const activeSurge = surgeAlerts.find((a) => a.daysUntilSurge === 0 || a.daysUntilSurge <= PLAN_DAYS)
  if (activeSurge) {
    return Math.ceil(baseline * activeSurge.projectedMultiplier)
  }

  return Math.ceil(baseline)
}

// ---------------------------------------------------------------------------
// Domain 1: Power Forecast
// ---------------------------------------------------------------------------

function generatePowerForecast(
  projectedDailyTests: number,
  config: LabForecastConfig,
): PowerForecast {
  const totalTests = projectedDailyTests * PLAN_DAYS
  const estimatedAnalyzerHours = parseFloat(
    (totalTests * config.analyzerHoursPerTest).toFixed(1),
  )
  const generatorFuelNeeded = parseFloat(
    (estimatedAnalyzerHours * config.generatorLitersPerHour).toFixed(1),
  )
  const solarAvailabilityHours = config.solarHoursPerDay
    ? config.solarHoursPerDay * PLAN_DAYS
    : null

  const recommendations: string[] = []

  if (solarAvailabilityHours !== null) {
    const solarCoverage = Math.min(solarAvailabilityHours, estimatedAnalyzerHours)
    const generatorGap = Math.max(0, estimatedAnalyzerHours - solarCoverage)
    if (generatorGap > 0) {
      recommendations.push(
        `Schedule analyzer runs before ${Math.round(config.solarHoursPerDay ?? 8) + 6}:00 to maximize solar coverage.`,
      )
      recommendations.push(
        `${generatorGap.toFixed(1)} analyzer-hours will require generator power (${(generatorGap * config.generatorLitersPerHour).toFixed(1)}L fuel).`,
      )
    } else {
      recommendations.push('Solar power sufficient for projected analyzer load during this period.')
    }
  } else {
    recommendations.push(
      `Stock ${generatorFuelNeeded}L of diesel for ${estimatedAnalyzerHours}h of analyzer operation over 30 days.`,
    )
    recommendations.push(
      'Consider scheduling batch runs during daytime to reduce generator runtime if solar panels are available.',
    )
  }

  recommendations.push(
    `Total projected analyzer load: ${estimatedAnalyzerHours}h over ${PLAN_DAYS} days (${projectedDailyTests} tests/day × ${config.analyzerHoursPerTest}h/test).`,
  )

  return {
    estimatedAnalyzerHours,
    solarAvailabilityHours,
    generatorFuelNeeded,
    recommendations,
  }
}

// ---------------------------------------------------------------------------
// Domain 2: Reagent Forecast
// ---------------------------------------------------------------------------

async function generateReagentForecast(
  patterns: SeasonalDemandPattern[],
  surgeAlerts: SurgeAlert[],
  config: LabForecastConfig,
): Promise<ReagentForecast> {
  const db = getDb()

  // Load active reagent inventory (ACTIVE or will expire/deplete within plan period)
  const inventory = await db.reagent_inventory
    .where('status')
    .equals('ACTIVE')
    .toArray()

  // Try to load Story 48.2 burndown projections if available
  let burndownAvailable = false
  let burndownMap: Map<string, { projectedDepletionDate: string | null }> = new Map()
  try {
    const { getBurndownProjections } = await import('@/lib/reagent-burndown')
    const projections = await getBurndownProjections()
    for (const proj of projections) {
      burndownMap.set(proj.reagentId, { projectedDepletionDate: proj.projectedDepletionDate })
    }
    burndownAvailable = true
  } catch {
    // Story 48.2 not yet available — use linear projection
    burndownAvailable = false
  }

  // Determine peak multiplier for the upcoming period
  const activeSurge = surgeAlerts.find((a) => a.daysUntilSurge <= PLAN_DAYS)
  const surgeMultiplier = activeSurge?.projectedMultiplier ?? 1

  const items: ReagentForecastItem[] = inventory.map((reagent) => {
    // Estimate daily consumption rate from historical usage
    const dailyConsumptionRate = reagent.expectedTests > 0
      ? reagent.expectedTests / 90  // assume ~90-day supply
      : 1

    const projectedDailyConsumption = dailyConsumptionRate * surgeMultiplier
    const projectedConsumption = Math.ceil(projectedDailyConsumption * PLAN_DAYS)

    // Depletion date: when stock runs out at projected rate
    let projectedDepletionDate: string | null = null
    if (burndownAvailable && burndownMap.has(reagent.reagentId)) {
      projectedDepletionDate = burndownMap.get(reagent.reagentId)!.projectedDepletionDate
    } else {
      // Linear projection: testsRemaining / dailyConsumption
      const testsRemaining = Math.max(0, reagent.expectedTests - reagent.testsPerformed)
      if (projectedDailyConsumption > 0 && testsRemaining > 0) {
        const daysUntilDepletion = Math.floor(testsRemaining / projectedDailyConsumption)
        const depletion = new Date()
        depletion.setDate(depletion.getDate() + daysUntilDepletion)
        projectedDepletionDate = depletion.toISOString().slice(0, 10)
      }
    }

    // Reorder deadline: depletion date - supplier lead time - safety buffer
    let reorderDeadline: string | null = null
    if (projectedDepletionDate) {
      const depletion = new Date(projectedDepletionDate)
      depletion.setDate(
        depletion.getDate() - config.supplierLeadTimeDays - config.reagentSafetyBufferDays,
      )
      reorderDeadline = depletion.toISOString().slice(0, 10)
    }

    return {
      reagentName: reagent.name,
      reagentId: reagent.reagentId,
      linkedLoincCode: reagent.linkedTestCode,
      currentStock: Math.max(0, reagent.expectedTests - reagent.testsPerformed),
      projectedConsumption,
      projectedDepletionDate,
      expiryDate: reagent.expiryDate ?? null,
      reorderDeadline,
      estimatedCost:
        projectedConsumption > 0 && reagent.costPerUnit > 0
          ? parseFloat((projectedConsumption * reagent.costPerUnit).toFixed(2))
          : undefined,
    }
  })

  return {
    items,
    dataSource: burndownAvailable ? 'burndown_48_2' : 'linear_projection',
  }
}

// ---------------------------------------------------------------------------
// Domain 3: Staffing Forecast
// ---------------------------------------------------------------------------

function generateStaffingForecast(
  projectedDailyTests: number,
  config: LabForecastConfig,
): StaffingForecast {
  const hoursPerShift = 8
  const testsPerTechPerShift = config.testsPerTechPerHour * hoursPerShift
  const recommendedStaffCount = Math.ceil(projectedDailyTests / testsPerTechPerShift)

  const staffGap = recommendedStaffCount - config.currentStaffCount
  const overtimeHoursEstimate = staffGap > 0
    ? 0  // overtime comes from existing staff only if gap > 0
    : Math.max(
        0,
        Math.ceil(
          ((projectedDailyTests - config.currentStaffCount * testsPerTechPerShift) / config.testsPerTechPerHour) * PLAN_DAYS,
        ),
      )

  const shiftAdjustments: string[] = []

  if (staffGap > 0) {
    shiftAdjustments.push(
      `Add ${staffGap} staff member(s) to handle projected volume of ${projectedDailyTests} tests/day.`,
    )
    shiftAdjustments.push(
      `Current capacity: ${config.currentStaffCount} staff × ${testsPerTechPerShift} tests/shift = ${config.currentStaffCount * testsPerTechPerShift} tests/day.`,
    )
    shiftAdjustments.push(
      `Initiate HR request at least ${config.hrLeadTimeDays} days before surge start.`,
    )
  } else if (staffGap < 0) {
    shiftAdjustments.push(
      `Current staffing is sufficient. Consider staggered shifts to reduce idle time during off-peak hours.`,
    )
  } else {
    shiftAdjustments.push(
      `Staffing is exactly at projected need — no gap. Recommend one on-call backup for contingency.`,
    )
  }

  shiftAdjustments.push(
    `Projected peak: ${projectedDailyTests} tests/day over ${PLAN_DAYS} days = ${projectedDailyTests * PLAN_DAYS} total tests.`,
  )

  return {
    currentStaffCount: config.currentStaffCount,
    projectedDailyTests,
    recommendedStaffCount,
    shiftAdjustments,
    overtimeHoursEstimate,
  }
}

// ---------------------------------------------------------------------------
// Domain 4: Protocol Recommendations
// ---------------------------------------------------------------------------

function generateProtocolRecommendations(
  patterns: SeasonalDemandPattern[],
  surgeAlerts: SurgeAlert[],
  projectedDailyTests: number,
): ProtocolRecommendation[] {
  const today = new Date()
  const surgeStartDate = surgeAlerts[0]?.surgeStartDate
    ? new Date(surgeAlerts[0].surgeStartDate)
    : new Date(today.getTime() + PLAN_DAYS * 86_400_000)

  const recommendations: ProtocolRecommendation[] = []

  // QC frequency adjustment during high-volume periods
  if (projectedDailyTests > 50) {
    recommendations.push({
      category: 'qc',
      recommendation:
        `Increase QC run frequency to 2× daily (beginning of shift + midday) during peak volume periods above 50 tests/day.`,
      priority: 'high',
      effectiveDate: surgeStartDate.toISOString().slice(0, 10),
    })
  } else {
    recommendations.push({
      category: 'qc',
      recommendation:
        'Maintain current QC frequency. Review QC charts weekly during peak season.',
      priority: 'medium',
      effectiveDate: surgeStartDate.toISOString().slice(0, 10),
    })
  }

  // Priority worklist: identify peak pathogen categories
  const peakCategories = patterns
    .filter((p) => p.testCategory !== 'ALL' && p.peakMonths.includes(today.getMonth() + 1))
    .map((p) => p.testCategoryDisplay)

  if (peakCategories.length > 0) {
    recommendations.push({
      category: 'worklist',
      recommendation:
        `Prioritize ${peakCategories.join(', ')} tests in the worklist during peak season. Set these LOINC categories at top of priority queue.`,
      priority: 'high',
      effectiveDate: surgeStartDate.toISOString().slice(0, 10),
    })
  }

  // Batch processing to maximize analyzer efficiency
  if (projectedDailyTests > 30) {
    recommendations.push({
      category: 'batch',
      recommendation:
        'Group similar test types into batches of ≥10 to reduce reagent dead volume and analyzer setup time during high-volume days.',
      priority: 'medium',
      effectiveDate: surgeStartDate.toISOString().slice(0, 10),
    })
  }

  // Staff training/protocol review
  recommendations.push({
    category: 'protocol',
    recommendation:
      'Hold a 30-minute team briefing at least 7 days before surge start to review peak-season protocols, backup procedures, and escalation contacts.',
    priority: 'medium',
    effectiveDate: new Date(
      Math.max(today.getTime(), surgeStartDate.getTime() - 7 * 86_400_000),
    )
      .toISOString()
      .slice(0, 10),
  })

  // Reagent management protocol
  recommendations.push({
    category: 'protocol',
    recommendation:
      'Implement FIFO (first-in, first-out) for all reagent lots during surge period to minimize expiry waste under high consumption.',
    priority: 'low',
    effectiveDate: surgeStartDate.toISOString().slice(0, 10),
  })

  return recommendations
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Generate a comprehensive 30-day seasonal operations plan.
 *
 * @param patterns  Demand patterns from analyzeHistoricalDemand()
 * @param surgeAlerts  Upcoming surge alerts from detectUpcomingSurge()
 * @param generatedBy  Opaque practitioner ID (no PHI)
 * @param partialConfig  Partial lab config — merged with defaults
 */
export async function generateSeasonalPlan(
  patterns: SeasonalDemandPattern[],
  surgeAlerts: SurgeAlert[],
  generatedBy: string,
  partialConfig?: Partial<LabForecastConfig>,
): Promise<SeasonalPlan> {
  const config: LabForecastConfig = { ...DEFAULT_CONFIG, ...partialConfig }

  const today = new Date()
  const planEnd = new Date(today)
  planEnd.setDate(planEnd.getDate() + PLAN_DAYS)

  const projectedDailyTests = computeProjectedDailyTests(patterns, surgeAlerts)

  const [powerForecast, reagentForecast, staffingForecast] = await Promise.all([
    Promise.resolve(generatePowerForecast(projectedDailyTests, config)),
    generateReagentForecast(patterns, surgeAlerts, config),
    Promise.resolve(generateStaffingForecast(projectedDailyTests, config)),
  ])

  const protocolRecommendations = generateProtocolRecommendations(
    patterns,
    surgeAlerts,
    projectedDailyTests,
  )

  // Overall confidence = minimum of pattern confidences
  const confidenceOrder = { high: 2, moderate: 1, low: 0 } as const
  const overallConfidence = patterns.reduce<'high' | 'moderate' | 'low'>(
    (min, p) => {
      const pLevel = confidenceOrder[p.confidence]
      const minLevel = confidenceOrder[min]
      return pLevel < minLevel ? p.confidence : min
    },
    'high',
  )

  const now = new Date().toISOString()
  const planId = uuidv4()

  return {
    id: planId,
    planPeriod: {
      start: today.toISOString().slice(0, 10),
      end: planEnd.toISOString().slice(0, 10),
    },
    generatedAt: serializeHlc(hlc.now()),
    generatedBy,
    status: 'draft',
    powerForecast,
    reagentForecast,
    staffingForecast,
    protocolRecommendations,
    deadlines: [],  // populated by deadline-calculator
    meta: {
      lastUpdated: now,
      versionId: '1',
    },
    _ultranos: {
      createdAt: now,
      dataConfidence: overallConfidence,
      surgeAlerts,
    },
  }
}

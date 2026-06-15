/**
 * Story 54.6 — Seasonal Operations Planner type definitions
 *
 * All data is aggregated statistical data — NO PHI.
 * Patient names, IDs, diagnoses, and other identifiers never appear here.
 */

// ---------------------------------------------------------------------------
// Historical demand patterns
// ---------------------------------------------------------------------------

export type PatternConfidence = 'high' | 'moderate' | 'low'

/**
 * Seasonal demand pattern derived from local Dexie test history,
 * or supplemented with HMIS aggregate data (Story 50.1).
 * No PHI — all values are aggregate counts and rates.
 */
export interface SeasonalDemandPattern {
  id: string                              // UUID
  testCategory: string                    // LOINC category (e.g. "18719-5")
  testCategoryDisplay: string             // Human-readable label
  /** 12-element array: average daily test count per calendar month (Jan=0, Dec=11) */
  monthlyBaseline: [number, number, number, number, number, number, number, number, number, number, number, number]
  /** Calendar months (1–12) identified as peak demand months */
  peakMonths: number[]
  /** Multiplier applied to baseline during peak months (e.g. 2.5 = 150% above baseline) */
  peakMultiplier: number
  /** Confidence level based on amount of historical data available */
  confidence: PatternConfidence
  /** ISO date when this pattern was last computed */
  computedAt: string
  /** Number of months of data used to compute this pattern */
  dataMonths: number
  /** Warning message if data is insufficient or supplemented from HMIS */
  warning?: string
}

// ---------------------------------------------------------------------------
// Surge detection
// ---------------------------------------------------------------------------

export interface SurgeAlert {
  testCategory: string
  testCategoryDisplay: string
  surgeStartDate: string      // ISO date — projected start of peak period
  surgeEndDate: string        // ISO date — projected end of peak period
  projectedMultiplier: number // Demand increase factor vs baseline
  daysUntilSurge: number      // How many days until surge begins
  confidence: PatternConfidence
}

// ---------------------------------------------------------------------------
// Forecast domain interfaces
// ---------------------------------------------------------------------------

export interface PowerForecast {
  estimatedAnalyzerHours: number           // Total analyzer-hours needed over plan period
  solarAvailabilityHours: number | null    // Daily solar window (null if no solar data)
  generatorFuelNeeded: number              // Estimated liters of diesel needed
  recommendations: string[]
}

export interface ReagentForecastItem {
  reagentName: string
  reagentId?: string                        // Dexie reagentId if available
  linkedLoincCode: string
  currentStock: number                      // Units currently in stock
  projectedConsumption: number              // Estimated units consumed over plan period
  projectedDepletionDate: string | null     // ISO date, null if stock sufficient
  expiryDate: string | null                 // ISO date, null if unknown
  reorderDeadline: string | null            // ISO date — when to order to avoid stockout
  supplier?: string
  estimatedCost?: number                    // AFN
}

export interface ReagentForecast {
  items: ReagentForecastItem[]
  dataSource: 'burndown_48_2' | 'linear_projection'  // Which model was used
}

export interface StaffingForecast {
  currentStaffCount: number
  projectedDailyTests: number            // Peak-period daily average
  recommendedStaffCount: number
  shiftAdjustments: string[]
  overtimeHoursEstimate: number          // Total overtime hours over plan period
}

export type ProtocolPriority = 'high' | 'medium' | 'low'

export interface ProtocolRecommendation {
  category: string                    // e.g. "qc", "worklist", "batch"
  recommendation: string
  priority: ProtocolPriority
  effectiveDate: string               // ISO date
}

// ---------------------------------------------------------------------------
// Actionable deadlines
// ---------------------------------------------------------------------------

export type DeadlineUrgency = 'critical' | 'important' | 'routine'
export type DeadlineCategory = 'reagent' | 'staffing' | 'power' | 'protocol'

export interface ActionableDeadline {
  id: string                    // UUID
  action: string                // Human-readable action description
  deadlineDate: string          // ISO date
  leadTimeDays: number          // Days of lead time built into this deadline
  urgency: DeadlineUrgency
  category: DeadlineCategory
  notes?: string
  /** Set when the manager marks this deadline as actioned */
  actionedAt?: string           // ISO date
  actionedNotes?: string
  isOverdue: boolean            // Computed: deadlineDate < today
}

// ---------------------------------------------------------------------------
// Seasonal plan (the main document)
// ---------------------------------------------------------------------------

export type SeasonalPlanStatus = 'draft' | 'finalized' | 'exported'

export interface SeasonalPlanPeriod {
  start: string   // ISO date
  end: string     // ISO date
}

export interface SeasonalPlan {
  id: string                                    // UUID
  planPeriod: SeasonalPlanPeriod
  generatedAt: string                           // HLC timestamp
  generatedBy: string                           // Practitioner ID (opaque — no PHI)
  status: SeasonalPlanStatus
  powerForecast: PowerForecast
  reagentForecast: ReagentForecast
  staffingForecast: StaffingForecast
  protocolRecommendations: ProtocolRecommendation[]
  deadlines: ActionableDeadline[]
  meta: {
    lastUpdated: string                         // ISO 8601 instant
    versionId: string
  }
  _ultranos: {
    createdAt: string                           // ISO 8601 (Ultranos extension)
    dataConfidence: PatternConfidence           // Overall plan confidence
    surgeAlerts: SurgeAlert[]                   // Alerts that triggered this plan
  }
}

// ---------------------------------------------------------------------------
// Lab config (subset needed for forecast generation)
// ---------------------------------------------------------------------------

export interface LabForecastConfig {
  /** Tests per lab-tech per hour (configurable, default 4) */
  testsPerTechPerHour: number
  /** Current number of lab staff */
  currentStaffCount: number
  /** Supplier lead time in days (default 14) */
  supplierLeadTimeDays: number
  /** HR lead time for requesting additional staff in days (default 14) */
  hrLeadTimeDays: number
  /** Fuel procurement lead time in days (default 7) */
  fuelLeadTimeDays: number
  /** Safety buffer for reagent reorder in days (default 7) */
  reagentSafetyBufferDays: number
  /** Daily solar availability window in hours (null if no solar) */
  solarHoursPerDay: number | null
  /** Analyzer operating hours needed per test (default 0.25 = 15 min) */
  analyzerHoursPerTest: number
  /** Liters of generator fuel per hour of analyzer operation (default 0.5) */
  generatorLitersPerHour: number
  /** Lab name for PDF export */
  labName: string
}

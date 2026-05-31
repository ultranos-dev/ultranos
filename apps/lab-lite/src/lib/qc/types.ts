/**
 * QC Data Types — Story 43.6: Analyzer Drift Detection
 *
 * All types for the Westgard multi-rule QC system.
 * QC data is non-PHI (no patient data — it's instrument/reagent control data).
 */

/**
 * A single QC control run entry.
 * Control materials are run independently of patient samples to verify instrument accuracy.
 * No PHI: runBy is an opaque practitioner ID, not a patient identifier.
 */
export interface QcRun {
  id: string
  analyte: string            // e.g. "Hemoglobin", "Glucose"
  loincCode: string          // LOINC code for the analyte
  instrumentId: string       // opaque instrument/analyzer ID
  controlLevel: QcControlLevel
  targetMean: number         // manufacturer's stated target mean (from control lot insert)
  targetSd: number           // manufacturer's stated target SD (from control lot insert)
  observedValue: number      // the measured control value
  runDate: string            // ISO 8601 date of the run
  runBy: string              // practitioner ID — opaque, not a patient
  hlcTimestamp: string       // HLC for offline sync ordering
}

/**
 * Control material levels used in QC runs.
 * Labs typically run 3 levels: low (LEVEL_1), normal (LEVEL_2), high (LEVEL_3).
 */
export type QcControlLevel = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3'

/**
 * Westgard multi-rule identifiers.
 * Each rule name follows the standard notation: N_XS or NX.
 * - N = number of consecutive values
 * - X = multiplier of SD
 * - S = standard deviation
 */
export type WestgardRule =
  | '1_2S'    // Warning: single value > 2SD
  | '1_3S'    // Reject: single value > 3SD
  | '2_2S'    // Reject: 2 consecutive > 2SD same direction
  | 'R_4S'    // Reject: range between 2 consecutive > 4SD
  | '4_1S'    // Warning: 4 consecutive > 1SD same side
  | '10X'     // Warning: 10 consecutive same side of mean
  | 'TREND_5' // Warning: 5+ consecutive trending in same direction

/**
 * Severity of a drift alert.
 * REJECT = out-of-control; stop testing, recalibrate.
 * WARNING = monitor; investigate before next run.
 */
export type DriftAlertSeverity = 'REJECT' | 'WARNING'

/**
 * A detected QC drift alert.
 * Lifecycle: created → displayed → acknowledged (with resolution) → closed.
 * acknowledgedAt/acknowledgedBy/resolution are null until supervisor acts.
 */
export interface DriftAlert {
  id: string
  analyte: string
  loincCode: string
  instrumentId: string
  controlLevel: QcControlLevel
  ruleViolated: WestgardRule
  severity: DriftAlertSeverity
  message: string            // human-readable alert text per AC #1
  consecutiveCount: number   // number of consecutive violations (for trend/10x context)
  detectedAt: string         // ISO 8601
  acknowledgedAt: string | null
  acknowledgedBy: string | null  // practitioner ID — opaque
  resolution: DriftAlertResolution | null
  resolutionNotes: string | null
}

/**
 * Resolution action taken when supervisor acknowledges the alert.
 */
export type DriftAlertResolution =
  | 'RECALIBRATED'
  | 'MAINTENANCE_PERFORMED'
  | 'FALSE_ALARM_VERIFIED'
  | 'DEFERRED_TO_SUPERVISOR'

/**
 * Result of Westgard rule check — returned by each rule function.
 */
export interface WestgardRuleResult {
  violated: boolean
  rule: WestgardRule
  message: string
  severity: DriftAlertSeverity
  consecutiveCount: number
}

/**
 * Result of trend detection analysis.
 */
export interface TrendResult {
  direction: 'UP' | 'DOWN'
  consecutiveCount: number
  startIndex: number
  slope: number              // linear regression slope over the consecutive values
}

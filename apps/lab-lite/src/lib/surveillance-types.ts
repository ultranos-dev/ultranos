/**
 * Surveillance Types — Story 50.3: Automated Disease Surveillance Alerts
 *
 * All types are aggregate-only — NO PHI.
 * Alerts contain counts, rates, and lab metadata — never patient identifiers.
 */

// ---------------------------------------------------------------------------
// SurveillanceAlert — stored in Dexie, transmitted to Hub
// ---------------------------------------------------------------------------

export interface SurveillanceAlert {
  id: string                              // UUID v4
  alertType: 'spike' | 'cluster'
  severity: 'warning' | 'critical'
  diseaseCode: string                     // e.g. 'malaria', 'tb', 'hep_b'
  diseaseLabel: string                    // Denormalized display name

  labFacilityId: string                   // Facility identifier
  labFacilityName: string                 // Denormalized for alert readability
  labProvince: string
  labDistrict: string

  // Spike-specific fields (populated when alertType === 'spike')
  currentRate?: number                    // Current period positivity rate (%)
  baselineRate?: number                   // 4-week rolling average (%)
  spikeRatio?: number                     // currentRate / baselineRate
  currentPeriodTestCount?: number         // Total tests in current period
  currentPeriodPositiveCount?: number     // Positive tests in current period
  periodStart?: string                    // ISO 8601
  periodEnd?: string                      // ISO 8601

  // Cluster-specific fields (populated when alertType === 'cluster')
  clusterCaseCount?: number               // Number of positive cases in window
  clusterWindowStart?: string             // ISO 8601
  clusterWindowEnd?: string               // ISO 8601

  // Alert metadata
  message: string                         // Human-readable alert message (localized)
  createdAt: string                       // ISO 8601
  transmissionStatus: 'pending' | 'transmitted' | 'failed'
  transmittedAt?: string                  // ISO 8601
  transmissionAttempts: number
  syncStatus: 'pending' | 'synced'
}

// ---------------------------------------------------------------------------
// ReportableDiseaseConfig — configurable per lab, seeded from defaults
// ---------------------------------------------------------------------------

export interface ReportableDiseaseConfig {
  diseaseCode: string                     // Primary key: 'malaria', 'tb', 'hep_b', etc.
  diseaseLabel: string                    // Display name
  loincCodes: string[]                    // LOINC codes that map to this disease
  positiveResultIndicators: string[]      // Result values indicating positive (e.g. 'positive', 'detected', 'reactive')
  spikeThresholdMultiplier: number        // Default 2.0 — trigger spike alert at this multiple of baseline
  clusterThreshold: number                // Default 3 — minimum cases in window to trigger cluster alert
  clusterWindowHours: number              // Default 48 — time window for cluster detection
  isActive: boolean                       // Can be toggled in settings
  isIhrReportable: boolean               // WHO International Health Regulations mandatory
  updatedAt: string                       // ISO 8601
}

// ---------------------------------------------------------------------------
// SurveillanceBaseline — cached rolling average per disease per date
// ---------------------------------------------------------------------------

export interface SurveillanceBaseline {
  id: string                              // `${diseaseCode}_${asOfDate}`
  diseaseCode: string
  asOfDate: string                        // ISO 8601 date (YYYY-MM-DD)
  weeklyRates: number[]                   // Positivity rates for each of the 4 weeks
  averageRate: number                     // Mean of weeklyRates
  totalTests: number                      // Total tests across 4 weeks
  totalPositive: number                   // Total positive across 4 weeks
  calculatedAt: string                    // ISO 8601
  dataWeeks: number                       // How many weeks of data were available (0–4)
}

// ---------------------------------------------------------------------------
// Detection result types (returned by engine, not stored)
// ---------------------------------------------------------------------------

export interface SpikeDetectionResult {
  detected: boolean
  severity: 'warning' | 'critical' | null
  currentRate: number
  baselineRate: number
  ratio: number
  testCount: number
  positiveCount: number
  periodStart: string
  periodEnd: string
  suppressedSmallSample: boolean
}

export interface ClusterDetectionResult {
  detected: boolean
  caseCount: number
  windowStart: string
  windowEnd: string
  caseTimestamps: string[]               // ISO strings only — NO patient identifiers
  suppressedDuplicate: boolean
}

// ---------------------------------------------------------------------------
// Scheduler config — singleton, persisted in Dexie
// ---------------------------------------------------------------------------

export interface SurveillanceSchedulerConfig {
  id: 'surveillance-scheduler'           // singleton
  lastSpikeCheckAt: string | null        // ISO 8601 — last daily spike check
  lastClusterCheckAt: string | null      // ISO 8601 — last cluster check (real-time)
  dailyCheckHour: number                 // 0–23, default 8 (08:00 local)
  isEnabled: boolean
}

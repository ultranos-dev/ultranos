/**
 * Competency Self-Assessment & Skill Decay Detection types — Story 46.3
 *
 * No PHI: competency records contain only procedure references (LOINC codes),
 * counts, and timestamps. No sample IDs, patient refs, or result values.
 *
 * Status thresholds (configurable per procedure):
 *   active      — last performed within decayThresholdDays (default 45)
 *   decay_risk  — last performed between 45 and 90 days ago
 *   decayed     — last performed >90 days ago OR never performed
 */

export type CompetencyStatus = 'active' | 'decay_risk' | 'decayed'

export type CompetencyTrend = 'improving' | 'stable' | 'declining'

export interface ProcedureCompetency {
  id: string
  technicianId: string
  procedureRef: string          // LOINC code
  procedureName: string
  lastPerformedAt: string | null  // ISO 8601
  totalPerformed: number
  performedLast90Days: number
  status: CompetencyStatus       // green, yellow, red
  decayThresholdDays: number     // configurable per procedure, default 45
  redThresholdDays: number       // configurable, default 90
  updatedAt: string              // ISO 8601
}

export interface SnapshotProcedureRecord {
  procedureRef: string
  status: CompetencyStatus
  daysSinceLast: number | null
}

export interface CompetencySnapshot {
  id: string
  technicianId: string
  snapshotDate: string           // YYYY-MM-DD
  procedures: SnapshotProcedureRecord[]
  syncStatus: 'pending' | 'synced'
}

/** Settings stored in Dexie — one record per technicianId. */
export interface CompetencySettings {
  technicianId: string
  shareWithSupervisor: boolean   // opt-in, default false
  updatedAt: string
}

/** Notification produced when a procedure transitions green → yellow. */
export interface DecayNotification {
  id: string
  technicianId: string
  procedureRef: string
  procedureName: string
  daysSinceLast: number
  linkedModuleId: string | null  // from Story 46.2 if available
  createdAt: string
  dismissed: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_DECAY_THRESHOLD_DAYS = 45
export const DEFAULT_RED_THRESHOLD_DAYS = 90

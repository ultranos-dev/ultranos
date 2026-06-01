/**
 * Outbreak Response Mode types — Story 54.5
 *
 * OutbreakModeConfig maps to a FHIR-aligned record of an outbreak declaration.
 * DailySitrep is a locally-computed aggregate report (no PHI — counts and rates only).
 * No patient identifiers in any outbreak type (CLAUDE.md Rule #1).
 */

/** A coded pathogen term with a human-readable display name. */
export interface TargetPathogen {
  /** Coded term — e.g. a SNOMED code or local slug (e.g. 'MALARIA') */
  code: string
  /** Human-readable display name (e.g. 'Malaria') */
  display: string
}

/** Role authorization check for outbreak operations. */
export type OutbreakAuthorizedRole = 'health_officer' | 'lab_supervisor'

/** Active state of an Outbreak Mode configuration. */
export type OutbreakStatus = 'active' | 'inactive'

/**
 * Outbreak mode configuration record.
 * Created when a health officer activates Outbreak Mode.
 * Stored locally in Dexie — synced to Hub at highest priority.
 * No PHI: all fields are operational/administrative metadata.
 */
export interface OutbreakModeConfig {
  /** UUID primary key */
  id: string
  status: OutbreakStatus
  /** Opaque practitioner ID of the activating authority */
  activatedBy: string
  /** HLC serialized timestamp — when mode was activated */
  activatedAt: string
  /** Opaque practitioner ID of the deactivating actor (null if still active) */
  deactivatedBy: string | null
  /** HLC serialized timestamp — when mode was deactivated (null if still active) */
  deactivatedAt: string | null
  /** Target pathogen or condition for this outbreak */
  targetPathogen: TargetPathogen
  /** Array of LOINC codes for the target diagnostic test(s) */
  targetTestCodes: string[]
  /** Array of lab location IDs in the outbreak scope (from Story 54.1) */
  affectedScope: string[]
  /** Free-text reason for activation (e.g. "WHO alert", "Provincial directive #12") */
  activationReason: string
  /** Multiplier applied to daily consumption rates for surge inventory projections (default 3) */
  surgeMultiplier: number
  /** FHIR R4 Meta — lastUpdated and versionId */
  meta: {
    lastUpdated: string
    versionId: string
  }
  /** Ultranos extension namespace */
  _ultranos: {
    /** ISO 8601 — when record was first created locally */
    createdAt: string
    /** HLC serialized timestamp for sync ordering */
    hlcTimestamp: string
  }
}

/**
 * Input for activating Outbreak Mode.
 * Caller must have health_officer or lab_supervisor role.
 */
export interface ActivateOutbreakInput {
  activatedBy: string
  targetPathogen: TargetPathogen
  targetTestCodes: string[]
  affectedScope: string[]
  activationReason: string
  /** Defaults to 3 if not provided */
  surgeMultiplier?: number
}

/**
 * Daily Situation Report (Sitrep) — aggregate operational metrics.
 * Generated automatically at end-of-day (18:00 local) or on-demand.
 * No PHI: all fields are counts, rates, and percentages (aggregate only).
 */
export interface DailySitrep {
  /** UUID primary key */
  id: string
  /** FK to OutbreakModeConfig.id */
  outbreakConfigId: string
  /** ISO date string (YYYY-MM-DD) — the reporting day */
  reportDate: string
  /** Total tests performed for the target test codes on this day */
  totalTestsPerformed: number
  /** Count of positive results among totalTestsPerformed */
  positiveCount: number
  /** (positiveCount / totalTestsPerformed) * 100, rounded to 1 decimal */
  positivityRate: number
  /** Reagent consumption rate in units per day (for target test reagents) */
  reagentBurnRate: number
  /** Projected stockout date for most critical reagent (null if > 30 days) */
  projectedStockoutDate: string | null
  /** Samples received but not yet processed as of sitrep generation time */
  pendingSamples: number
  /** HLC serialized timestamp — when sitrep was generated */
  generatedAt: string
  /** Practitioner ID of the generator, or 'system' for auto-generated */
  generatedBy: string
  syncStatus: 'pending' | 'synced'
}

/**
 * Surge projection for a single reagent under outbreak surge demand.
 * Used by surge-inventory.ts and SitrepView display.
 * No PHI — reagent names and counts are operational data.
 */
export interface SurgeProjection {
  reagentId: string
  reagentName: string
  /** LOINC code of the test this reagent is linked to */
  linkedTestCode: string
  currentStock: number
  /** Normal (pre-surge) daily consumption rate */
  baselineBurnRate: number
  /** baselineBurnRate * surgeMultiplier */
  surgedBurnRate: number
  /** Days until depletion at surged rate (currentStock / surgedBurnRate) */
  daysUntilDepletion: number
  /** ISO date string — projected stockout date */
  projectedStockoutDate: string
  /** Flag: true if projectedStockoutDate is within 7 days */
  isCritical: boolean
}

/**
 * Queue priority descriptor returned by outbreak-service for a specimen.
 * Used by queue display logic to sort and badge outbreak-priority samples.
 */
export type OutbreakQueuePriority = {
  /** Whether this sample qualifies for outbreak priority boosting */
  isOutbreakPriority: boolean
  /** Numeric priority level (higher = top of queue); 0 = standard priority */
  priorityLevel: number
  /** The outbreak config ID that triggered this priority, or null */
  outbreakConfigId: string | null
}

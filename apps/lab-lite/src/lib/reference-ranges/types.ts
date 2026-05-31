/**
 * Localized Reference Ranges — Core Types
 * Story 43.8 — AC 1, 4, 5
 *
 * Provides altitude-adjusted, age-specific, and gender-specific reference ranges
 * for lab analytes. Critical for Afghan/Central Asian clinical settings where
 * altitude (Kabul ~1800m, Bamyan ~2500m) and population genetics affect normal values.
 *
 * PHI note: reference ranges contain NO patient data.
 */

// ---------------------------------------------------------------------------
// Source classification
// ---------------------------------------------------------------------------

export type RangeSource = 'DEFAULT' | 'LAB_CUSTOM' | 'POPULATION_STUDY' | 'MANUFACTURER'

// ---------------------------------------------------------------------------
// Core reference range
// ---------------------------------------------------------------------------

/**
 * A single reference range entry covering a specific (loincCode, age bracket,
 * gender, altitude) combination. Multiple rows cover different segments.
 */
export interface ReferenceRange {
  id: string                    // UUID
  loincCode: string             // LOINC code for the analyte
  analyteName: string           // Human-readable name
  ageMin: number                // Minimum age in years (inclusive)
  ageMax: number                // Maximum age in years (exclusive) — use 999 for no upper bound
  gender: 'M' | 'F' | 'ALL'    // Gender specificity
  altitudeMin: number           // Minimum altitude in meters (0 = sea-level applicable)
  altitudeMax?: number          // Maximum altitude (undefined = no upper limit)
  rangeMin: number              // Lower bound of normal range (inclusive)
  rangeMax: number              // Upper bound of normal range (inclusive)
  criticalMin?: number          // Critical low threshold (optional)
  criticalMax?: number          // Critical high threshold (optional)
  unit: string                  // Unit of measurement (e.g. 'g/dL', '10^3/uL')
  source: RangeSource           // Provenance of this range
  version: number               // Monotonically increasing version number
  effectiveFrom: string         // ISO 8601 — when this version became active
  effectiveTo?: string          // ISO 8601 — when superseded (undefined = current)
  createdBy: string             // Practitioner ID who created/modified this range
  createdAt: string             // ISO 8601
  hlcTimestamp: string          // HLC timestamp for sync ordering
}

// ---------------------------------------------------------------------------
// Versioning / audit trail
// ---------------------------------------------------------------------------

/**
 * Immutable record of each change to a reference range.
 * Every edit produces a new RangeVersion — never overwrites previous versions.
 */
export interface RangeVersion {
  id: string                              // UUID
  rangeId: string                         // References the ReferenceRange.id
  version: number                         // Version number introduced by this change
  changedBy: string                       // Practitioner ID
  changedAt: string                       // ISO 8601
  previousValues: Partial<ReferenceRange> // Fields before this change
  newValues: Partial<ReferenceRange>      // Fields after this change
  changeReason: string                    // Mandatory — minimum 10 characters
}

// ---------------------------------------------------------------------------
// Lightweight snapshot attached to results (AC #5)
// ---------------------------------------------------------------------------

/**
 * Compact snapshot of the range active when a result was produced.
 * Attached to each result as `_ultranos.referenceRange` — never updated.
 */
export interface RangeSnapshot {
  rangeId: string        // Which ReferenceRange this was taken from
  version: number        // The version at time of result
  rangeMin: number
  rangeMax: number
  criticalMin?: number
  criticalMax?: number
  source: RangeSource
}

// ---------------------------------------------------------------------------
// Result flagging output
// ---------------------------------------------------------------------------

export type ResultFlag = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH'

/**
 * FHIR Observation interpretation codes.
 * https://hl7.org/fhir/R4/valueset-observation-interpretation.html
 */
export type ResultFlagCode = 'N' | 'L' | 'H' | 'LL' | 'HH'

export interface FlagResult {
  flag: ResultFlagCode
  level: ResultFlag
}

// ---------------------------------------------------------------------------
// Source badge display metadata (AC #3)
// ---------------------------------------------------------------------------

export type SourceBadgeVariant = 'gray' | 'blue' | 'green' | 'yellow'

export const SOURCE_BADGE_VARIANT: Record<RangeSource, SourceBadgeVariant> = {
  DEFAULT: 'gray',
  LAB_CUSTOM: 'blue',
  POPULATION_STUDY: 'green',
  MANUFACTURER: 'yellow',
}

export const SOURCE_DISPLAY_LABEL: Record<RangeSource, string> = {
  DEFAULT: 'Default',
  LAB_CUSTOM: 'Custom',
  POPULATION_STUDY: 'Population Study',
  MANUFACTURER: 'Manufacturer',
}

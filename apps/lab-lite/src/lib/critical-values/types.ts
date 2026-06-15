/**
 * Story 43.7 — Pre-Release Critical Value Checklist: Core Types
 *
 * PHI note: No patient data in these types. Analyte names are clinical
 * configuration, not patient-identifying data.
 */

// ---------------------------------------------------------------------------
// Threshold types
// ---------------------------------------------------------------------------

/**
 * Critical value threshold for a single analyte.
 * Stored in the `criticalValueThresholds` Dexie table.
 * Default thresholds are seeded on DB upgrade; labs can add overrides.
 */
export interface CriticalValueThreshold {
  id?: number             // Dexie auto-increment
  loincCode: string       // unique key for lab overrides
  analyte: string         // analyte name — must match CriticalValueInput.analyte in engine
  testName: string        // human-readable display name (may differ from analyte)
  unit: string
  criticalLow: number | null
  criticalHigh: number | null
  isActive: boolean
  configuredBy: string    // 'system' for defaults; practitioner ID for lab overrides
  updatedAt: string       // ISO 8601
}

/**
 * A single critical finding returned by the detector.
 * Direction and threshold are used for display in the checklist header.
 * Actual numeric value is NOT included — CLAUDE.md Rule #1.
 */
export interface CriticalValueMatch {
  loincCode: string
  analyte: string
  direction: 'HIGH' | 'LOW'
  threshold: number
  unit?: string
}

// ---------------------------------------------------------------------------
// Checklist item types
// ---------------------------------------------------------------------------

export interface ChecklistItem {
  id: string
  label: string
  isRequired: boolean
  isChecked: boolean
  /** Set when this item was auto-verified from system evidence */
  isAutoVerified?: boolean
  /** Set when the item is not applicable (e.g. no prior result for delta check) */
  isNotApplicable?: boolean
  checkedBy?: string      // practitioner ID who manually checked or unchecked
  checkedAt?: string      // ISO 8601
}

/**
 * Completed checklist stored as part of a result's audit trail.
 * AC #3: stored in `completedChecklists` Dexie table.
 */
export interface CompletedChecklist {
  id: string              // UUID — sync key
  resultId: string        // opaque result ID
  /** Serialized items — JSON array stored as string in Dexie */
  items: ChecklistItem[]
  completedBy: string     // practitioner ID
  completedAt: string     // ISO 8601
  hlcTimestamp: string    // HLC for ordering
  syncStatus: 'local' | 'syncing' | 'synced'
}

// ---------------------------------------------------------------------------
// Checklist configuration types (AC #4 — configurable per lab)
// ---------------------------------------------------------------------------

export interface ChecklistConfigItem {
  id: string
  label: string
  isRequired: boolean
  /** True = built-in; default items cannot be removed, only toggled optional */
  isDefault: boolean
  order: number
}

export interface ChecklistConfig {
  id: 'config'            // singleton row per lab
  labId: string
  items: ChecklistConfigItem[]
  updatedAt: string       // ISO 8601
  updatedBy: string       // practitioner ID
}

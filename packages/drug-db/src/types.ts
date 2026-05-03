import { DrugInteractionSeverity } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance, FhirMedicationStatementZod } from '@ultranos/shared-types'

// Re-export for consumer convenience
export { DrugInteractionSeverity }
export type { FhirAllergyIntolerance, FhirMedicationStatementZod }

/** A single interaction entry from the drug database vocabulary table. */
export interface VocabInteractionEntry {
  drugA: string
  drugB: string
  severity: string
  description: string
}

/** A single detected interaction between two drugs (or drug ↔ allergy). */
export interface InteractionResult {
  severity: DrugInteractionSeverity
  drugA: string
  drugB: string
  description: string
}

/**
 * Summary of all interactions found for a new medication.
 *
 * - BLOCKED: CONTRAINDICATED, ALLERGY_MATCH, or MAJOR detected
 * - WARNING: MODERATE or MINOR detected
 * - CLEAR: no interactions detected (database had data)
 * - UNAVAILABLE: database returned zero entries — never report CLEAR on empty data
 */
export interface InteractionCheckSummary {
  result: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactions: InteractionResult[]
  reason?: 'DATABASE_STALE' | 'EMPTY_DATABASE' | 'ADAPTER_ERROR'
}

/**
 * Extended options for cross-encounter interaction checks.
 */
export interface InteractionCheckOptions {
  /** Active MedicationStatements from patient history (cross-encounter) */
  activeMedications?: FhirMedicationStatementZod[]
  /** Active allergies */
  activeAllergies?: FhirAllergyIntolerance[]
  /** Callback invoked when the database is stale, intended to trigger background sync */
  onStale?: () => void
}

/**
 * Platform-agnostic adapter for loading drug interaction data.
 * Each app creates its own adapter (Dexie for PWA, SQLite for mobile, in-memory for tests).
 */
export interface DrugDatabaseAdapter {
  /** Get all interaction entries from the database */
  getInteractions(): Promise<VocabInteractionEntry[]>
  /** Get database metadata for staleness checks */
  getMetadata?(): Promise<{ lastUpdatedAt: string; version: number } | null>
}

/**
 * Conflict resolution tier configuration.
 *
 * Maps FHIR resource types to conflict resolution tiers:
 * - TIER_1 (Safety-Critical): Append-only, physician review required
 * - TIER_2 (Clinical): Timestamp-based, both versions kept as addenda
 * - TIER_3 (Operational): Last-Write-Wins
 * - CONSENT: Append-only ledger (like Tier 1, but no prescription blocking)
 * - QUEUE: Chronological replay with 60s conflict window
 */

export type ConflictTier = 'TIER_1' | 'TIER_2' | 'TIER_3' | 'CONSENT' | 'QUEUE'

const CONFLICT_TIER_MAP: Record<string, ConflictTier> = {
  // Tier 1 — Safety-Critical (append-only, blocks prescriptions)
  AllergyIntolerance: 'TIER_1',
  MedicationRequest: 'TIER_1',
  MedicationStatement: 'TIER_1',
  Condition: 'TIER_1',
  KeyRevocationList: 'TIER_1',

  // Tier 2 — Clinical (timestamp-based, both kept as addenda)
  ClinicalImpression: 'TIER_2',
  DiagnosticReport: 'TIER_2',
  Observation: 'TIER_2',
  MedicationDispense: 'TIER_2',
  Encounter: 'TIER_2',

  // Tier 3 — Operational (LWW)
  Patient: 'TIER_3',

  // Consent — append-only ledger, high priority
  Consent: 'CONSENT',
}

/**
 * Get the conflict resolution tier for a FHIR resource type.
 * Unknown resource types default to TIER_3 (LWW).
 */
export function getConflictTier(resourceType: string): ConflictTier {
  return CONFLICT_TIER_MAP[resourceType] ?? 'TIER_3'
}

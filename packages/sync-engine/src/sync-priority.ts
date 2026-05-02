/**
 * Sync priority configuration for resource types.
 *
 * CLAUDE.md priority sync order:
 *   allergies → prescriptions → lab notifications → notes → vitals → metadata
 *
 * Consent is classified as high-priority (same level as allergies)
 * because consent changes must propagate immediately to enforce
 * data access restrictions at the Hub API layer.
 *
 * Lower number = higher priority.
 */
export const SYNC_PRIORITY: Record<string, number> = {
  AllergyIntolerance: 1,
  Consent: 1,              // High-priority: consent changes affect data access immediately
  KeyRevocationList: 1,    // High-priority: revoked keys must propagate immediately (Story 7.4 AC 3)
  MedicationRequest: 2,
  MedicationStatement: 2,
  DiagnosticReport: 3,
  Encounter: 4,
  ClinicalImpression: 4,
  Condition: 4,
  Observation: 5,
  Patient: 6,
}

/**
 * Get the sync priority for a FHIR resource type.
 * Unknown resource types get lowest priority (99).
 */
export function getSyncPriority(resourceType: string): number {
  return SYNC_PRIORITY[resourceType] ?? 99
}

/**
 * Compare two resources by sync priority for queue ordering.
 * Returns negative if a should sync first, positive if b should sync first.
 */
export function compareSyncPriority(
  resourceTypeA: string,
  resourceTypeB: string,
): number {
  return getSyncPriority(resourceTypeA) - getSyncPriority(resourceTypeB)
}

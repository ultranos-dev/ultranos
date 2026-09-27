import { AuditResourceType } from '@ultranos/shared-types'

/**
 * Map a FHIR/sync resourceType (e.g. 'Observation', 'AllergyIntolerance') to the
 * audit-domain `AuditResourceType` enum value (e.g. OBSERVATION, ALLERGY).
 *
 * The sync layer stores resources under their FHIR resourceType, but audit events
 * are validated at the Hub against the UPPERCASE `AuditResourceType` allowlist. The
 * old `entry.resourceType as AuditResourceType` casts were a lie — they emitted the
 * FHIR-cased string ('Observation'), which the Hub's `audit.sync` Zod enum rejects
 * (400). A rejected batch drops EVERY event in it, silently losing PHI-access audit
 * records (Rule #6). This mapper guarantees a valid, claimable audit value.
 *
 * Targets match existing non-sync audit precedent (Condition & ClinicalImpression →
 * CLINICAL_NOTE, MedicationRequest → PRESCRIPTION). Anything unmapped falls back to
 * SYSTEM — never an invalid value that would drop the batch.
 *
 * Kept in a SIDE-EFFECT-FREE module (no Dexie / drain-worker imports) so it can be
 * imported by the sync layer without pulling in `@/lib/audit`'s adapter wiring — and
 * so tests that fully mock `@/lib/audit` still get the real mapping.
 */
const FHIR_TO_AUDIT_RESOURCE_TYPE: Record<string, AuditResourceType> = {
  Patient: AuditResourceType.PATIENT,
  Observation: AuditResourceType.OBSERVATION,
  Encounter: AuditResourceType.ENCOUNTER,
  Condition: AuditResourceType.CLINICAL_NOTE,
  MedicationRequest: AuditResourceType.PRESCRIPTION,
  MedicationStatement: AuditResourceType.MEDICATION_STATEMENT,
  AllergyIntolerance: AuditResourceType.ALLERGY,
  ServiceRequest: AuditResourceType.SERVICE_REQUEST,
  DiagnosticReport: AuditResourceType.DIAGNOSTIC_REPORT,
  ClinicalImpression: AuditResourceType.CLINICAL_NOTE,
  Appointment: AuditResourceType.APPOINTMENT,
}

const VALID_AUDIT_RESOURCE_TYPES = new Set<string>(Object.values(AuditResourceType))

export function fhirToAuditResourceType(resourceType: string): AuditResourceType {
  const mapped = FHIR_TO_AUDIT_RESOURCE_TYPE[resourceType]
  if (mapped) return mapped
  // Already a valid audit-domain value? Pass it through.
  if (VALID_AUDIT_RESOURCE_TYPES.has(resourceType)) return resourceType as AuditResourceType
  // Unknown — never emit an invalid value (would 400 the whole audit.sync batch).
  return AuditResourceType.SYSTEM
}

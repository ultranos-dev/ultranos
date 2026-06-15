/**
 * FHIR-to-DB resource mappers.
 *
 * The FHIR R4 resource shapes (nested objects) don't match the flat
 * Supabase column schemas. These mappers flatten each resource type
 * before the row is passed to db.toRow() for snake_case + encryption.
 *
 * Each mapper returns a flat camelCase object whose keys align 1:1
 * with the DB columns (after toSnakeCase converts them).
 */

// ---------------------------------------------------------------------------
// Encounter → encounters table
// ---------------------------------------------------------------------------

interface FhirEncounterPayload {
  id: string
  resourceType?: string
  status: string
  class?: { system?: string; code?: string; display?: string }
  type?: unknown
  subject?: { reference?: string }
  participant?: unknown
  period?: { start?: string; end?: string }
  reasonCode?: unknown
  diagnosis?: unknown
  _ultranos?: {
    clinicId?: string
    soapNoteId?: string
    isOfflineCreated?: boolean
    hlcTimestamp?: string
    createdAt?: string
  }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenEncounter(payload: FhirEncounterPayload): Record<string, unknown> {
  const subjectRef = payload.subject?.reference ?? ''
  const subjectId = subjectRef.replace(/^Patient\//, '')

  return {
    id: payload.id,
    status: payload.status,
    // class → three flat columns
    classSystem: payload.class?.system ?? 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    classCode: payload.class?.code ?? 'AMB',
    classDisplay: payload.class?.display ?? null,
    // type stays JSONB
    type: payload.type ?? null,
    // subject.reference → subject_id (UUID)
    subjectId,
    // participant stays JSONB
    participant: payload.participant ?? null,
    // period → two flat columns
    periodStart: payload.period?.start ?? null,
    periodEnd: payload.period?.end ?? null,
    // reasonCode stays JSONB
    reasonCode: payload.reasonCode ?? null,
    // diagnosis stays JSONB
    diagnosis: payload.diagnosis ?? null,
    // _ultranos → flat columns
    clinicId: payload._ultranos?.clinicId ?? null,
    soapNoteId: payload._ultranos?.soapNoteId ?? null,
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    // meta → flat columns
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    // _ultranos.createdAt → created_at (Ultranos extension, not in meta)
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// ClinicalImpression (SOAP) → soap_ledger table
// ---------------------------------------------------------------------------

interface FhirClinicalImpressionPayload {
  id: string
  resourceType?: string
  encounterId?: string
  practitionerId?: string
  soapSubjective?: string
  soapObjective?: string
  soapAssessment?: string
  soapPlan?: string
  _ultranos?: { hlcTimestamp?: string; createdAt?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenClinicalImpression(payload: FhirClinicalImpressionPayload): Record<string, unknown> {
  return {
    id: payload.id,
    encounterId: payload.encounterId,
    practitionerId: payload.practitionerId,
    soapSubjective: payload.soapSubjective ?? null,
    soapObjective: payload.soapObjective ?? null,
    soapAssessment: payload.soapAssessment ?? null,
    soapPlan: payload.soapPlan ?? null,
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Patient → patients table (mostly flat already)
// ---------------------------------------------------------------------------

function flattenPatient(payload: Record<string, unknown>): Record<string, unknown> {
  // Patient schema is already flat in the DB — strip resourceType and pass through
  const { resourceType: _, ...rest } = payload
  return rest
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const mappers: Record<string, (payload: Record<string, unknown>) => Record<string, unknown>> = {
  Encounter: flattenEncounter as (p: Record<string, unknown>) => Record<string, unknown>,
  ClinicalImpression: flattenClinicalImpression as (p: Record<string, unknown>) => Record<string, unknown>,
  Patient: flattenPatient,
}

/**
 * Flatten a FHIR resource payload into the shape expected by the DB table.
 *
 * hlcTimestamp is always injected by the caller (sync.push) after flattening,
 * so mappers should NOT include it — except where it comes from _ultranos
 * (which is stripped during flattening). The caller overwrites with the
 * canonical HLC from the sync operation.
 *
 * Returns the flattened row (camelCase keys). For unmapped resource types,
 * strips `resourceType` and returns as-is with a warning.
 */
export function flattenForDb(
  resourceType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const mapper = mappers[resourceType]
  if (mapper) {
    return mapper(payload)
  }

  // Unmapped resource type — strip resourceType field, pass through.
  // The upsert will likely fail on column mismatch, but that's the
  // existing behavior and those tables may not exist yet anyway.
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[resource-mappers] No mapper for resource type "${resourceType}" — passing through`,
    )
  }
  const { resourceType: _, ...rest } = payload
  return rest
}

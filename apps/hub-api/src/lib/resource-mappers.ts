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

/**
 * Normalize Encounter.participant references to the canonical FHIR
 * "Practitioner/<id>" form. Some spoke versions historically stored a bare UUID
 * in `individual.reference`, which silently breaks participant-scoped queries
 * (encounter.listByPractitioner matches on "Practitioner/<id>"). Normalizing at
 * ingestion makes the Hub authoritative regardless of the spoke's format — a
 * reference without a resource-type prefix (no "/") is assumed to be a Practitioner.
 */
function normalizeParticipantRefs(participant: unknown): unknown {
  if (!Array.isArray(participant)) return participant ?? null
  return participant.map((p) => {
    if (p && typeof p === 'object' && 'individual' in p) {
      const individual = (p as { individual?: { reference?: string } }).individual
      const ref = individual?.reference
      if (typeof ref === 'string' && ref.length > 0 && !ref.includes('/')) {
        return { ...p, individual: { ...individual, reference: `Practitioner/${ref}` } }
      }
    }
    return p
  })
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
    // participant stays JSONB — normalized to canonical Practitioner/<id> refs so
    // participant-scoped queries work regardless of the spoke's reference format.
    participant: normalizeParticipantRefs(payload.participant),
    // period → two flat columns
    periodStart: payload.period?.start ?? null,
    periodEnd: payload.period?.end ?? null,
    // reasonCode stays JSONB
    reasonCode: payload.reasonCode ?? null,
    // FHIR Encounter.diagnosis (Condition references) → diagnosis_refs JSONB.
    // Column is NOT named `diagnosis` to avoid the global field-encryption entry
    // of that name, which would encrypt-as-text and corrupt the jsonb write.
    diagnosisRefs: payload.diagnosis ?? null,
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

// Field names must match the client ledger entry persisted by the OPD-Lite SOAP
// store (subjective/objective/assessment/plan + assessorRef), NOT the soap_*
// DB column names — otherwise the note text and practitioner persist as NULL.
interface FhirClinicalImpressionPayload {
  id: string
  resourceType?: string
  encounterId?: string
  assessorRef?: string       // `Practitioner/<uuid>`
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
  createdAt?: string
  _ultranos?: { hlcTimestamp?: string; createdAt?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenClinicalImpression(payload: FhirClinicalImpressionPayload): Record<string, unknown> {
  return {
    id: payload.id,
    encounterId: payload.encounterId,
    practitionerId: (payload.assessorRef ?? '').replace(/^Practitioner\//, '') || null,
    soapSubjective: payload.subjective ?? null,
    soapObjective: payload.objective ?? null,
    soapAssessment: payload.assessment ?? null,
    soapPlan: payload.plan ?? null,
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    createdAt: payload.createdAt ?? payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Observation (vitals) → observations table
// ---------------------------------------------------------------------------

interface FhirObservationPayload {
  id: string
  resourceType?: string
  status?: string
  category?: unknown
  code?: unknown
  subject?: { reference?: string }
  encounter?: { reference?: string }
  effectiveDateTime?: string
  performer?: unknown
  valueQuantity?: unknown
  component?: unknown
  _ultranos?: { isOfflineCreated?: boolean; hlcTimestamp?: string; createdAt?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenObservation(payload: FhirObservationPayload): Record<string, unknown> {
  const subjectId = (payload.subject?.reference ?? '').replace(/^Patient\//, '')
  const encounterId = (payload.encounter?.reference ?? '').replace(/^Encounter\//, '') || null
  return {
    id: payload.id,
    status: payload.status ?? 'final',
    // code / category / value_quantity / component stay JSONB (not encrypted)
    category: payload.category ?? null,
    code: payload.code ?? null,
    subjectId,
    encounterId,
    effectiveDateTime: payload.effectiveDateTime ?? null,
    performer: payload.performer ?? null,
    valueQuantity: payload.valueQuantity ?? null,
    component: payload.component ?? null,
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
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
// AllergyIntolerance → allergy_intolerances table (Tier-1, append-only)
// ---------------------------------------------------------------------------

interface FhirAllergyIntolerancePayload {
  id: string
  resourceType?: string
  clinicalStatus?: { coding?: Array<{ code?: string }> }
  verificationStatus?: { coding?: Array<{ code?: string }> }
  type?: string
  criticality?: string
  code?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string }
  patient?: { reference?: string }
  recorder?: { reference?: string }
  recordedDate?: string
  _ultranos?: { substanceFreeText?: string; createdAt?: string; recordedByRole?: string; isOfflineCreated?: boolean; hlcTimestamp?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenAllergyIntolerance(payload: FhirAllergyIntolerancePayload): Record<string, unknown> {
  const coding = payload.code?.coding?.[0]
  return {
    id: payload.id,
    clinicalStatusCode: payload.clinicalStatus?.coding?.[0]?.code ?? null,
    verificationStatusCode: payload.verificationStatus?.coding?.[0]?.code ?? null,
    type: payload.type ?? null,
    criticality: payload.criticality ?? null,
    substanceText: payload.code?.text ?? coding?.display ?? null,
    substanceCode: coding?.code ?? null,
    substanceSystem: coding?.system ?? null,
    // patient_ref / recorder_ref store the bare UUID so the pull's patient-scope
    // filter (.eq('patient_ref', patientId)) matches.
    patientRef: (payload.patient?.reference ?? '').replace(/^Patient\//, '') || null,
    recorderRef: (payload.recorder?.reference ?? '').replace(/^Practitioner\//, '') || null,
    recordedDate: payload.recordedDate ?? null,
    substanceFreeText: payload._ultranos?.substanceFreeText ?? null,
    metaLastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Condition → conditions table
// ---------------------------------------------------------------------------

interface FhirConditionPayload {
  id: string
  resourceType?: string
  clinicalStatus?: unknown
  category?: unknown
  code?: unknown
  subject?: { reference?: string }
  encounter?: { reference?: string }
  recorder?: { reference?: string }
  recordedDate?: string
  _ultranos?: { isOfflineCreated?: boolean; hlcTimestamp?: string; createdAt?: string; diagnosisRank?: string }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenCondition(payload: FhirConditionPayload): Record<string, unknown> {
  return {
    id: payload.id,
    clinicalStatus: payload.clinicalStatus ?? null,   // jsonb
    category: payload.category ?? null,                // jsonb
    code: payload.code ?? null,                        // jsonb
    subjectId: (payload.subject?.reference ?? '').replace(/^Patient\//, '') || null,
    encounterId: (payload.encounter?.reference ?? '').replace(/^Encounter\//, '') || null,
    recorderId: (payload.recorder?.reference ?? '').replace(/^Practitioner\//, '') || null,
    recordedDate: payload.recordedDate ?? null,
    diagnosisRank: payload._ultranos?.diagnosisRank ?? null,
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    versionId: payload.meta?.versionId ?? '1',
    lastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// MedicationRequest → medication_requests table
// ---------------------------------------------------------------------------

interface FhirMedicationRequestPayload {
  id: string
  resourceType?: string
  status?: string
  intent?: string
  medicationCodeableConcept?: { coding?: Array<{ system?: string; code?: string; display?: string }>; text?: string }
  subject?: { reference?: string }
  encounter?: { reference?: string }
  requester?: { reference?: string }
  authoredOn?: string
  dosageInstruction?: unknown
  dispenseRequest?: unknown
  _ultranos?: {
    prescriptionStatus?: string
    interactionCheckResult?: string
    interactionOverrideReason?: string
    isOfflineCreated?: boolean
    hlcTimestamp?: string
    createdAt?: string
  }
  meta?: { lastUpdated?: string; versionId?: string }
}

function flattenMedicationRequest(payload: FhirMedicationRequestPayload): Record<string, unknown> {
  const cc = payload.medicationCodeableConcept
  return {
    id: payload.id,
    resourceType: 'MedicationRequest',
    status: payload.status ?? null,
    prescriptionStatus: payload._ultranos?.prescriptionStatus ?? null,
    intent: payload.intent ?? 'order',
    // medication_codeable_concept is a TEXT column — store the CodeableConcept as
    // JSON text (db.toRow does not stringify non-encrypted fields).
    medicationCodeableConcept: cc ? JSON.stringify(cc) : null,
    medicationDisplay: cc?.coding?.[0]?.display ?? null,   // standardized, non-PHI
    medicationText: cc?.text ?? null,                      // PHI — encrypted by db.toRow (randomizedFields)
    subjectReference: (payload.subject?.reference ?? '').replace(/^Patient\//, '') || null,
    encounterReference: (payload.encounter?.reference ?? '').replace(/^Encounter\//, '') || null,
    requesterId: (payload.requester?.reference ?? '').replace(/^Practitioner\//, '') || null,
    authoredOn: payload.authoredOn ?? null,
    dosageInstruction: payload.dosageInstruction ?? null,  // jsonb — encrypted by db.toRow (randomizedFields)
    dispenseRequest: payload.dispenseRequest ?? null,      // jsonb
    interactionCheck: payload._ultranos?.interactionCheckResult ?? null,
    interactionOverride: payload._ultranos?.interactionOverrideReason ?? null, // encrypted by db.toRow
    isOfflineCreated: payload._ultranos?.isOfflineCreated ?? false,
    metaLastUpdated: payload.meta?.lastUpdated ?? new Date().toISOString(),
    metaVersionId: payload.meta?.versionId ?? '1',
    createdAt: payload._ultranos?.createdAt ?? new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

// Payload param is `any` because each mapper accepts a narrower FHIR payload
// shape; the dispatcher only ever passes a parsed JSON object.
const mappers: Record<string, (payload: any) => Record<string, unknown>> = {
  Encounter: flattenEncounter,
  ClinicalImpression: flattenClinicalImpression,
  Observation: flattenObservation,
  AllergyIntolerance: flattenAllergyIntolerance,
  Condition: flattenCondition,
  MedicationRequest: flattenMedicationRequest,
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

/**
 * Pull patient changes from Hub and apply to local Dexie tables.
 *
 * Uses the sync.pull tRPC endpoint with incremental HLC watermarks.
 * Applies conflict resolution per tier before writing to IndexedDB.
 */

import { db } from './db'
import { hlc } from './hlc'
import {
  resolveConflict,
  deserializeHlc,
  compareHlc,
  type SyncRecord,
} from '@ultranos/sync-engine'
import { auditPhiAccess, AuditAction } from './audit'
import type { AuditResourceType } from './audit'
import type { FhirPatient, PatientAddress, PatientTier } from '@ultranos/shared-types'
import { getHubTrpcUrl } from '@/lib/hub-url'

const HUB_BASE_URL = getHubTrpcUrl()

/**
 * A valid "zero" HLC string (`wallMs:counter:nodeId`). Used when a record carries
 * no HLC — e.g. Tier-3 patients, which are LWW-versioned by `updated_at`, not HLC.
 * NOTE: `deserializeHlc` requires ≥3 colon-parts, so a bare `'0'` is INVALID and
 * throws; the zero value must be fully formed.
 */
const ZERO_HLC = '0:0:'

/**
 * Transform a flat camelCase patient row from the Hub into the nested
 * FhirPatient shape expected by client components.
 *
 * The Hub stores patient data as flat Postgres columns (snake_case),
 * which are converted to flat camelCase by db.fromRows(). The client
 * expects FhirPatient with a nested `_ultranos` extension block.
 */
function toFhirPatient(row: Record<string, unknown>): FhirPatient {
  // If already in FhirPatient shape (e.g. stored by registration), return as-is
  if (row._ultranos && typeof row._ultranos === 'object') {
    return row as unknown as FhirPatient
  }

  const addressOrigin: PatientAddress | undefined =
    row.addressProvinceOrigin
      ? {
          province: row.addressProvinceOrigin as PatientAddress['province'],
          district: (row.addressDistrictOrigin as string) ?? '',
          village: (row.addressVillageOrigin as string) || undefined,
        }
      : undefined

  const addressCurrent: PatientAddress | undefined =
    row.addressProvinceCurrent
      ? {
          province: row.addressProvinceCurrent as PatientAddress['province'],
          district: (row.addressDistrictCurrent as string) ?? '',
          village: (row.addressVillageCurrent as string) || undefined,
        }
      : undefined

  const phone = (row.telecomPhone as string) || undefined

  return {
    id: row.id as string,
    resourceType: 'Patient',
    name: [
      {
        given: row.nameGiven ? [row.nameGiven as string] : [],
        text: (row.nameLocal as string) ?? '',
      },
    ],
    gender: row.gender as FhirPatient['gender'],
    birthDate: (row.birthDate as string) || undefined,
    birthYearOnly: (row.birthYearOnly as boolean) ?? true,
    telecom: phone ? [{ system: 'phone', value: phone }] : [],
    _ultranos: {
      nameLocal: (row.nameLocalEnc as string) ?? (row.nameLocal as string) ?? '',
      nameLatin: (row.nameLatinEnc as string) ?? (row.nameLatin as string) ?? undefined,
      namePhonetic: (row.namePhoneticEnc as string) ?? (row.namePhonetic as string) ?? undefined,
      nationalIdHash: (row.nationalIdHash as string) ?? undefined,
      guardianId: (row.guardianId as string) ?? undefined,
      consentVersion: (row.consentVersion as string) ?? undefined,
      patient_tier: ((row.patientTier as string) ?? 'FREE') as PatientTier,
      preferredLanguage: (row.preferredLanguage as string) ?? undefined,
      isActive: (row.isActive as boolean) ?? true,
      createdBy: (row.createdBy as string) ?? undefined,
      createdAt: (row.createdAt as string) ?? new Date().toISOString(),
      nameGiven: (row.nameGivenEnc as string) ?? (row.nameGiven as string) ?? undefined,
      nameFather: (row.nameFatherEnc as string) ?? (row.nameFather as string) ?? undefined,
      nameGrandfather: (row.nameGrandfatherEnc as string) ?? (row.nameGrandfather as string) ?? undefined,
      birthYear: (row.birthYear as number) ?? undefined,
      addressOrigin,
      addressCurrent,
      isNomadic: (row.isNomadic as boolean) ?? false,
      biometricFingerprintHash: (row.biometricFingerprintHash as string) ?? undefined,
      biometricAlgorithmVersion: (row.biometricAlgorithmVersion as string) ?? undefined,
      mpiScore: (row.mpiScore as number) ?? undefined,
      identifiers: (row.identifiers as FhirPatient['_ultranos']['identifiers']) ?? undefined,
      photoUrl: (row.photoUrl as string) ?? undefined,
      bloodGroup: (row.bloodGroup as string) ?? undefined,
    },
    meta: {
      lastUpdated: (row.updatedAt as string) ?? (row.meta as Record<string, unknown>)?.lastUpdated as string ?? new Date().toISOString(),
      versionId: (row.metaVersionId as string) ?? (row.meta as Record<string, unknown>)?.versionId as string ?? undefined,
    },
  }
}

/**
 * Transform resource data from Hub format to the FHIR shape expected
 * by client components, based on resource type.
 */
function transformResourceData(
  resourceType: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (resourceType === 'Patient') {
    return toFhirPatient(data) as unknown as Record<string, unknown>
  }
  if (resourceType === 'Encounter') {
    return toFhirEncounter(data)
  }
  if (resourceType === 'AllergyIntolerance') {
    return toFhirAllergyIntolerance(data)
  }
  if (resourceType === 'Observation') {
    return toFhirObservation(data)
  }
  if (resourceType === 'Condition') {
    return toFhirCondition(data)
  }
  if (resourceType === 'MedicationRequest') {
    return toFhirMedicationRequest(data)
  }
  if (resourceType === 'ClinicalImpression') {
    return toSoapLedgerEntry(data)
  }
  if (resourceType === 'MedicationStatement') {
    return toFhirMedicationStatement(data)
  }
  return data
}

/**
 * Parse a CodeableConcept that the Hub stores as a JSON string (TEXT column),
 * tolerating an already-parsed object. Falls back to reconstructing from the
 * decrypted text / standardized display when the JSON is absent or unparseable.
 */
function parseCodeableConcept(
  value: unknown,
  fallbackText?: string,
  fallbackDisplay?: string,
): Record<string, unknown> | undefined {
  if (value && typeof value === 'object') return value as Record<string, unknown>
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      // fall through to fallback reconstruction
    }
  }
  if (fallbackText || fallbackDisplay) {
    return {
      ...(fallbackText ? { text: fallbackText } : {}),
      ...(fallbackDisplay ? { coding: [{ display: fallbackDisplay }] } : {}),
    }
  }
  return undefined
}

/**
 * Observation (vitals): Hub flat row → nested FHIR. Local components query
 * `encounter.reference` / `subject.reference` and read `_ultranos.hlcTimestamp`.
 */
export function toFhirObservation(row: Record<string, unknown>): Record<string, unknown> {
  if (row.subject && typeof row.subject === 'object') return row
  const subjectId = (row.subjectId as string) ?? ''
  const encounterId = (row.encounterId as string) ?? ''
  return {
    id: row.id,
    resourceType: 'Observation',
    status: (row.status as string) ?? 'final',
    ...(row.category ? { category: row.category } : {}),
    ...(row.code ? { code: row.code } : {}),
    subject: { reference: subjectId ? `Patient/${subjectId}` : '' },
    ...(encounterId ? { encounter: { reference: `Encounter/${encounterId}` } } : {}),
    ...(row.effectiveDateTime ? { effectiveDateTime: row.effectiveDateTime as string } : {}),
    ...(row.performer ? { performer: row.performer } : {}),
    ...(row.valueQuantity ? { valueQuantity: row.valueQuantity } : {}),
    ...(row.component ? { component: row.component } : {}),
    _ultranos: {
      isOfflineCreated: (row.isOfflineCreated as boolean) ?? false,
      hlcTimestamp: (row.hlcTimestamp as string) ?? '',
      createdAt: (row.createdAt as string) ?? '',
    },
    meta: {
      lastUpdated: (row.lastUpdated as string) ?? '',
      versionId: (row.versionId as string) ?? '1',
    },
  }
}

/**
 * Condition (diagnoses): Hub flat row → nested FHIR. Local components query
 * `encounter.reference` / `subject.reference` and sort by `_ultranos.diagnosisRank`.
 */
export function toFhirCondition(row: Record<string, unknown>): Record<string, unknown> {
  if (row.subject && typeof row.subject === 'object') return row
  const subjectId = (row.subjectId as string) ?? ''
  const encounterId = (row.encounterId as string) ?? ''
  const recorderId = (row.recorderId as string) ?? ''
  return {
    id: row.id,
    resourceType: 'Condition',
    ...(row.clinicalStatus ? { clinicalStatus: row.clinicalStatus } : {}),
    ...(row.category ? { category: row.category } : {}),
    ...(row.code ? { code: row.code } : {}),
    subject: { reference: subjectId ? `Patient/${subjectId}` : '' },
    ...(encounterId ? { encounter: { reference: `Encounter/${encounterId}` } } : {}),
    ...(recorderId ? { recorder: { reference: `Practitioner/${recorderId}` } } : {}),
    ...(row.recordedDate ? { recordedDate: row.recordedDate as string } : {}),
    _ultranos: {
      ...(row.diagnosisRank != null ? { diagnosisRank: row.diagnosisRank } : {}),
      isOfflineCreated: (row.isOfflineCreated as boolean) ?? false,
      hlcTimestamp: (row.hlcTimestamp as string) ?? '',
      createdAt: (row.createdAt as string) ?? '',
    },
    meta: {
      lastUpdated: (row.lastUpdated as string) ?? '',
      versionId: (row.versionId as string) ?? '1',
    },
  }
}

/**
 * MedicationRequest (prescriptions): Hub flat row → nested FHIR. Local components
 * query `encounter.reference` / `subject.reference`. The Hub stores the
 * CodeableConcept as JSON text and the references as bare UUIDs.
 */
export function toFhirMedicationRequest(row: Record<string, unknown>): Record<string, unknown> {
  if (row.subject && typeof row.subject === 'object') return row
  const subjectRef = (row.subjectReference as string) ?? ''
  const encounterRef = (row.encounterReference as string) ?? ''
  const requesterId = (row.requesterId as string) ?? ''
  return {
    id: row.id,
    resourceType: 'MedicationRequest',
    status: (row.status as string) ?? 'active',
    intent: (row.intent as string) ?? 'order',
    medicationCodeableConcept: parseCodeableConcept(
      row.medicationCodeableConcept,
      row.medicationText as string,
      row.medicationDisplay as string,
    ),
    subject: { reference: subjectRef ? `Patient/${subjectRef}` : '' },
    ...(encounterRef ? { encounter: { reference: `Encounter/${encounterRef}` } } : {}),
    ...(requesterId ? { requester: { reference: `Practitioner/${requesterId}` } } : {}),
    ...(row.authoredOn ? { authoredOn: row.authoredOn as string } : {}),
    ...(row.dosageInstruction ? { dosageInstruction: row.dosageInstruction } : {}),
    ...(row.dispenseRequest ? { dispenseRequest: row.dispenseRequest } : {}),
    _ultranos: {
      ...(row.prescriptionStatus ? { prescriptionStatus: row.prescriptionStatus as string } : {}),
      ...(row.interactionCheck ? { interactionCheckResult: row.interactionCheck as string } : {}),
      ...(row.interactionOverride ? { interactionOverrideReason: row.interactionOverride as string } : {}),
      isOfflineCreated: (row.isOfflineCreated as boolean) ?? false,
      hlcTimestamp: (row.hlcTimestamp as string) ?? '',
      createdAt: (row.createdAt as string) ?? '',
    },
    meta: {
      lastUpdated: (row.metaLastUpdated as string) ?? '',
      versionId: (row.metaVersionId as string) ?? '1',
    },
  }
}

/**
 * ClinicalImpression (SOAP): Hub flat row → local SoapLedgerEntry. NOT a nested
 * FHIR resource — the soapLedger table is queried by flat `encounterId` and
 * top-level `hlcTimestamp`; only the soap_* fields need renaming.
 */
export function toSoapLedgerEntry(row: Record<string, unknown>): Record<string, unknown> {
  // Already in the local ledger shape (e.g. a locally-created entry).
  if (row.subjective !== undefined || row.assessorRef !== undefined) return row
  const practitionerId = (row.practitionerId as string) ?? ''
  return {
    id: row.id,
    encounterId: row.encounterId,
    ...(practitionerId ? { assessorRef: `Practitioner/${practitionerId}` } : {}),
    ...(row.soapSubjective ? { subjective: row.soapSubjective as string } : {}),
    ...(row.soapObjective ? { objective: row.soapObjective as string } : {}),
    ...(row.soapAssessment ? { assessment: row.soapAssessment as string } : {}),
    ...(row.soapPlan ? { plan: row.soapPlan as string } : {}),
    hlcTimestamp: (row.hlcTimestamp as string) ?? '',
    createdAt: (row.createdAt as string) ?? '',
    ...(row.source ? { source: row.source as string } : {}),
    ...(row.aiModelVersion ? { aiModelVersion: row.aiModelVersion as string } : {}),
    ...(row.confirmedBy ? { confirmedBy: row.confirmedBy as string } : {}),
    ...(row.confirmedAt ? { confirmedAt: row.confirmedAt as string } : {}),
  }
}

/**
 * MedicationStatement (active-meds history): Hub flat row → nested FHIR. Local
 * components query `subject.reference` and `_ultranos.sourcePrescriptionId`.
 */
export function toFhirMedicationStatement(row: Record<string, unknown>): Record<string, unknown> {
  if (row.subject && typeof row.subject === 'object') return row
  const subjectRef = (row.subjectReference as string) ?? ''
  const start = row.effectivePeriodStart as string | undefined
  const end = row.effectivePeriodEnd as string | undefined
  return {
    id: row.id,
    resourceType: 'MedicationStatement',
    status: (row.status as string) ?? 'active',
    medicationCodeableConcept: parseCodeableConcept(
      row.medicationCodeableConcept,
      undefined,
      row.medicationDisplay as string,
    ),
    subject: { reference: subjectRef ? `Patient/${subjectRef}` : '' },
    ...(start || end
      ? { effectivePeriod: { ...(start ? { start } : {}), ...(end ? { end } : {}) } }
      : {}),
    ...(row.dateAsserted ? { dateAsserted: row.dateAsserted as string } : {}),
    ...(row.informationSourceReference
      ? { informationSource: { reference: row.informationSourceReference as string } }
      : {}),
    _ultranos: {
      ...(row.sourceEncounterId ? { sourceEncounterId: row.sourceEncounterId as string } : {}),
      ...(row.sourcePrescriptionId ? { sourcePrescriptionId: row.sourcePrescriptionId as string } : {}),
      isOfflineCreated: (row.isOfflineCreated as boolean) ?? false,
      hlcTimestamp: (row.hlcTimestamp as string) ?? '',
      createdAt: (row.createdAt as string) ?? '',
    },
    meta: {
      lastUpdated: (row.metaLastUpdated as string) ?? '',
      versionId: (row.metaVersionId as string) ?? '1',
    },
  }
}

/**
 * Reconstruct the nested FHIR AllergyIntolerance shape from the Hub's flat row
 * (inverse of the server's flattenAllergyIntolerance). The Hub stores patient_ref
 * as a bare UUID; local components query `patient.reference` ("Patient/{id}") and
 * read `_ultranos.substanceFreeText`, so a pulled allergy must be re-nested.
 */
export function toFhirAllergyIntolerance(row: Record<string, unknown>): Record<string, unknown> {
  if (row.patient && typeof row.patient === 'object') return row

  const patientRef = (row.patientRef as string) ?? ''
  const recorderRef = (row.recorderRef as string) ?? ''
  return {
    id: row.id,
    resourceType: 'AllergyIntolerance',
    clinicalStatus: {
      coding: [{
        system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        code: (row.clinicalStatusCode as string) ?? 'active',
      }],
    },
    ...(row.verificationStatusCode
      ? { verificationStatus: { coding: [{ code: row.verificationStatusCode as string }] } }
      : {}),
    ...(row.type ? { type: row.type as string } : {}),
    ...(row.criticality ? { criticality: row.criticality as string } : {}),
    code: {
      ...(row.substanceText ? { text: row.substanceText as string } : {}),
      ...(row.substanceCode || row.substanceSystem
        ? { coding: [{ system: row.substanceSystem as string, code: row.substanceCode as string }] }
        : {}),
    },
    patient: { reference: patientRef ? `Patient/${patientRef}` : '' },
    ...(recorderRef ? { recorder: { reference: `Practitioner/${recorderRef}` } } : {}),
    ...(row.recordedDate ? { recordedDate: row.recordedDate as string } : {}),
    _ultranos: {
      ...(row.substanceFreeText ? { substanceFreeText: row.substanceFreeText as string } : {}),
      hlcTimestamp: (row.hlcTimestamp as string) ?? '',
      createdAt: (row.createdAt as string) ?? (row.metaLastUpdated as string) ?? '',
    },
    meta: {
      lastUpdated: (row.metaLastUpdated as string) ?? '',
      versionId: '1',
    },
  }
}

/**
 * Reconstruct the nested FHIR Encounter shape from the Hub's flat row (the
 * inverse of the server's flattenEncounter). The Hub returns flat camelCase
 * columns (subjectId, classCode, periodStart, top-level hlcTimestamp); local
 * components query `subject.reference` and read `_ultranos.hlcTimestamp`, so a
 * pulled encounter must be re-nested or it won't match / display.
 */
export function toFhirEncounter(row: Record<string, unknown>): Record<string, unknown> {
  // Already nested (e.g. a locally-created record) — leave untouched.
  if (row.subject && typeof row.subject === 'object') return row

  const subjectId = (row.subjectId as string) ?? ''
  return {
    id: row.id,
    resourceType: 'Encounter',
    status: row.status,
    class: {
      system: (row.classSystem as string) ?? 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: (row.classCode as string) ?? 'AMB',
      ...(row.classDisplay ? { display: row.classDisplay as string } : {}),
    },
    ...(row.type ? { type: row.type } : {}),
    subject: { reference: subjectId ? `Patient/${subjectId}` : '' },
    ...(row.participant ? { participant: row.participant } : {}),
    period: {
      ...(row.periodStart ? { start: row.periodStart as string } : {}),
      ...(row.periodEnd ? { end: row.periodEnd as string } : {}),
    },
    ...(row.reasonCode ? { reasonCode: row.reasonCode } : {}),
    ...(row.diagnosisRefs ? { diagnosis: row.diagnosisRefs } : {}),
    _ultranos: {
      ...(row.clinicId ? { clinicId: row.clinicId as string } : {}),
      ...(row.soapNoteId ? { soapNoteId: row.soapNoteId as string } : {}),
      isOfflineCreated: (row.isOfflineCreated as boolean) ?? false,
      hlcTimestamp: (row.hlcTimestamp as string) ?? '',
      createdAt: (row.createdAt as string) ?? (row.lastUpdated as string) ?? '',
    },
    meta: {
      lastUpdated: (row.lastUpdated as string) ?? '',
      versionId: (row.versionId as string) ?? '1',
    },
  }
}

/** Maps FHIR resourceType to the Dexie table name for local storage. */
const RESOURCE_TABLE_MAP: Record<string, string> = {
  Patient: 'patients',
  Encounter: 'encounters',
  ClinicalImpression: 'soapLedger',
  Observation: 'observations',
  Condition: 'conditions',
  MedicationRequest: 'medications',
  AllergyIntolerance: 'allergyIntolerances',
  MedicationStatement: 'medicationStatements',
}

export interface PullResult {
  changesApplied: number
  conflictsDetected: number
  errors: string[]
}

/**
 * Pull all changes for a patient from the Hub since the last known HLC.
 * Applies changes to the appropriate Dexie tables with tier-based conflict resolution.
 */
export async function pullPatientChanges(
  patientId: string,
  getAuthToken: () => string,
): Promise<PullResult> {
  const result: PullResult = { changesApplied: 0, conflictsDetected: 0, errors: [] }

  // 1. Look up the last-known HLC watermark for this patient
  const meta = await db.syncMeta.get(patientId)
  const sinceHlc = meta?.lastPulledHlc ?? '0'

  // 2. Call sync.pull via tRPC
  const token = getAuthToken()
  const params = encodeURIComponent(JSON.stringify({ json: { patientId, sinceHlc } }))
  const res = await fetch(`${HUB_BASE_URL}/sync.pull?input=${params}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    result.errors.push(`Pull failed: HTTP ${res.status}`)
    return result
  }

  const data = await res.json() as {
    result: { data: { json: { changes: Array<{
      resourceType: string
      resourceId: string
      data: Record<string, unknown>
      hlcTimestamp: string
    }> } } }
  }

  const changes = data.result?.data?.json?.changes
  if (!changes || changes.length === 0) {
    // No changes — update the watermark timestamp only
    await db.syncMeta.put({
      patientId,
      lastPulledHlc: sinceHlc,
      lastPulledAt: new Date().toISOString(),
    })
    return result
  }

  // 3. Apply each change to the local Dexie table
  let highestHlc = sinceHlc

  for (const change of changes) {
    const tableName = RESOURCE_TABLE_MAP[change.resourceType]
    if (!tableName) {
      result.errors.push(`Unknown resourceType: ${change.resourceType}`)
      continue
    }

    try {
      const table = (db as unknown as Record<string, { get: (key: string) => Promise<unknown>; put: (item: unknown) => Promise<unknown> }>)[tableName]
      if (!table) {
        result.errors.push(`No local table for: ${tableName}`)
        continue
      }
      const localRecord = await table.get(change.resourceId)

      const transformedData = transformResourceData(change.resourceType, change.data)

      if (!localRecord) {
        // No local version — straight insert
        await table.put({ ...transformedData, id: change.resourceId })
        result.changesApplied++
      } else if (change.resourceType === 'Patient') {
        // Demographics are Tier-3 (last-write-wins) and the Hub is authoritative.
        // Patients carry an ISO `updated_at`, NOT an HLC, so routing them through the
        // generic HLC conflict path both mis-compares and spuriously flags a
        // "conflict": the ISO parses to a tiny wallMs (parseInt('2026-…')=2026) that
        // lands inside the 60s window, so every pull raised a bogus Demographics
        // conflict. Do a plain LWW by meta.lastUpdated with NO conflict flag, and
        // skip the HLC clock/watermark below — an ISO string sorts ABOVE real HLCs
        // and would poison the per-patient watermark, stalling incremental sync for
        // real-HLC resources (encounters, vitals, …).
        const localUpdated = ((localRecord as Record<string, unknown>).meta as Record<string, unknown> | undefined)?.lastUpdated as string | undefined
        const remoteUpdated = (transformedData.meta as Record<string, unknown> | undefined)?.lastUpdated as string | undefined
        if (!localUpdated || !remoteUpdated || remoteUpdated >= localUpdated) {
          await table.put({ ...transformedData, id: change.resourceId })
          result.changesApplied++
        }
        // else: a newer unsynced local edit exists — keep it (LWW).
        auditPhiAccess(
          AuditAction.READ,
          change.resourceType as AuditResourceType,
          change.resourceId,
          patientId,
          { source: 'sync-pull' },
        )
        continue
      } else {
        // Local record exists — run conflict resolution.
        // Guard every HLC deserialize with a zero default so a missing HLC can't
        // throw (`undefined.split`) and fail the apply.
        const localUltranos = (localRecord as Record<string, unknown>)._ultranos as Record<string, unknown> | undefined
        const localHlc = deserializeHlc((localUltranos?.hlcTimestamp as string) || ZERO_HLC)
        const remoteHlc = deserializeHlc(change.hlcTimestamp || ZERO_HLC)

        // Skip if we already have the same or newer version
        if (compareHlc(localHlc, remoteHlc) >= 0) {
          continue
        }

        const localSyncRecord: SyncRecord = {
          id: change.resourceId,
          data: localRecord as Record<string, unknown>,
          hlcTimestamp: localHlc,
          version: ((localRecord as Record<string, unknown>).meta as Record<string, unknown>)?.versionId as string ?? '1',
        }
        const remoteSyncRecord: SyncRecord = {
          id: change.resourceId,
          data: transformedData,
          hlcTimestamp: remoteHlc,
          version: (transformedData.meta as Record<string, unknown>)?.versionId as string ?? '1',
        }

        const resolution = resolveConflict(localSyncRecord, remoteSyncRecord, change.resourceType)

        if (resolution.conflictFlag) {
          // Persist conflict for physician review
          result.conflictsDetected++
          await db.syncQueue.put({
            id: `pull-conflict-${change.resourceId}-${Date.now()}`,
            resourceType: change.resourceType,
            resourceId: change.resourceId,
            action: 'pull-conflict',
            payload: JSON.stringify(localRecord),
            status: 'failed',
            hlcTimestamp: change.hlcTimestamp,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            conflictFlag: true,
            conflictData: JSON.stringify(change.data),
            patientRef: `Patient/${patientId}`,
          })
        }

        // Apply the winning version(s) to the table
        if (resolution.strategy === 'LWW') {
          // Tier 3: winner replaces
          const winner = resolution.winner === 'remote' ? transformedData : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'TIMESTAMP_WINS') {
          // Tier 2: winner is primary, loser kept as addendum
          const winner = resolution.winner === 'remote' ? transformedData : localRecord
          await table.put({ ...winner as Record<string, unknown>, id: change.resourceId })
        } else if (resolution.strategy === 'APPEND_ONLY') {
          // Tier 1/Consent: both versions kept — remote gets a new ID
          await table.put({ ...transformedData, id: `${change.resourceId}-remote-${Date.now()}` })
        }

        result.changesApplied++
      }

      // Update HLC clock with remote timestamp for causal ordering
      hlc.receive(deserializeHlc(change.hlcTimestamp || ZERO_HLC))

      // Track highest HLC for watermark update
      if (change.hlcTimestamp > highestHlc) {
        highestHlc = change.hlcTimestamp
      }

      // Audit each PHI read
      auditPhiAccess(
        AuditAction.READ,
        change.resourceType as AuditResourceType,
        change.resourceId,
        patientId,
        { source: 'sync-pull' },
      )
    } catch (err) {
      result.errors.push(`Failed to apply ${change.resourceType}/${change.resourceId}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  // 4. Update the watermark
  await db.syncMeta.put({
    patientId,
    lastPulledHlc: highestHlc,
    lastPulledAt: new Date().toISOString(),
  })

  return result
}

export interface PractitionerEncountersPullResult {
  changesApplied: number
  errors: string[]
}

/**
 * Apply a single pulled encounter row to local Dexie with a Tier 2 (clinical,
 * newer-wins) HLC guard: the remote version is written only when it is strictly
 * newer than the local copy, so a locally-created/edited encounter that hasn't
 * synced yet is never clobbered. Returns true if a write occurred.
 */
async function applyPulledEncounter(row: Record<string, unknown>): Promise<boolean> {
  const transformed = toFhirEncounter(row)
  const id = transformed.id as string
  if (!id) return false

  const local = await db.encounters.get(id)
  if (local) {
    const localHlc = deserializeHlc(
      ((local._ultranos as Record<string, unknown> | undefined)?.hlcTimestamp as string) || '0',
    )
    const remoteHlc = deserializeHlc(
      ((transformed._ultranos as Record<string, unknown> | undefined)?.hlcTimestamp as string) || '0',
    )
    // Newer-wins (Tier 2): skip when local is same-or-newer — preserves unsynced edits.
    if (compareHlc(localHlc, remoteHlc) >= 0) return false
  }

  await db.encounters.put(transformed as unknown as Parameters<typeof db.encounters.put>[0])

  const subjectId = (transformed.subject as { reference?: string } | undefined)?.reference?.replace(
    'Patient/',
    '',
  )
  auditPhiAccess(
    AuditAction.READ,
    'Encounter' as AuditResourceType,
    id,
    subjectId,
    { source: 'sync-pull-practitioner' },
  )
  return true
}

/**
 * Pull ALL of the authenticated practitioner's active-status encounters (planned,
 * in-progress, finished) across all patients from the Hub and upsert them into
 * local Dexie, to fully hydrate the clinician dashboard/queue on login. Pages
 * through every cursor page until exhausted. Patient names shown on the dashboard
 * resolve from the patient list pulled alongside this on login.
 *
 * Offline-safe: returns early when offline; a page-fetch failure stops paging but
 * keeps whatever was already applied; per-row failures are collected, not thrown.
 */
export async function pullPractitionerEncounters(
  getAuthToken: () => string,
  opts?: { limit?: number },
): Promise<PractitionerEncountersPullResult> {
  const result: PractitionerEncountersPullResult = { changesApplied: 0, errors: [] }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return result

  const { listEncountersByPractitionerFromHub } = await import('@/lib/trpc')
  let cursor: string | undefined

  while (true) {
    let page: Array<Record<string, unknown>>
    let nextCursor: string | null
    try {
      const res = await listEncountersByPractitionerFromHub(getAuthToken(), cursor, opts?.limit)
      page = res.encounters
      nextCursor = res.nextCursor
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'Practitioner encounters pull failed')
      break
    }

    for (const row of page) {
      try {
        if (await applyPulledEncounter(row)) result.changesApplied++
      } catch (err) {
        result.errors.push(`Failed to apply encounter: ${err instanceof Error ? err.message : 'unknown'}`)
      }
    }

    if (!nextCursor) break
    cursor = nextCursor
  }

  return result
}

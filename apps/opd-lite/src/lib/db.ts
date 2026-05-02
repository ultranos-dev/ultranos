import Dexie, { type EntityTable } from 'dexie'
import type { FhirPatient, FhirEncounterZod, FhirObservation, FhirCondition, FhirMedicationRequestZod, FhirAllergyIntolerance, FhirMedicationStatementZod } from '@ultranos/shared-types'
import type { ClientAuditEvent } from '@ultranos/audit-logger/client'
import {
  applyEncryptionMiddleware,
  type EncryptionTableConfig,
} from './dexie-encryption-middleware'

/**
 * Local patient record type — mirrors FhirPatient for Dexie storage.
 * Dexie stores these in IndexedDB with indexed fields for fast lookup.
 */
export type LocalPatient = FhirPatient

export type LocalEncounter = FhirEncounterZod

export interface SoapLedgerEntry {
  id: string
  encounterId: string
  subjective: string
  objective: string
  hlcTimestamp: string
  createdAt: string
}

export type LocalObservation = FhirObservation

export type LocalCondition = FhirCondition

export type LocalMedicationRequest = FhirMedicationRequestZod

export type LocalAllergyIntolerance = FhirAllergyIntolerance

export type LocalMedicationStatement = FhirMedicationStatementZod

export interface InteractionAuditEntry {
  id: string
  encounterId: string
  patientId: string
  medicationRequestId: string
  medicationDisplay: string
  checkResult: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactionsFound: number
  overrideReason?: string
  practitionerRef: string
  hlcTimestamp: string
  createdAt: string
}

export interface SyncQueueEntry {
  id: string
  resourceType: string
  resourceId: string
  action: string
  payload: string
  status: 'pending' | 'in-flight' | 'failed'
  hlcTimestamp: string
  createdAt: string
  retryCount: number
  lastAttemptAt?: string
  conflictFlag?: boolean
  failureReason?: string
}

export interface PractitionerKeyEntry {
  publicKey: string          // base64-encoded Ed25519 public key (primary key)
  practitionerId: string
  practitionerName: string
  cachedAt: string           // ISO 8601 timestamp
}

// --- Vocabulary tables (Story 10.3) ---

export interface VocabMedicationEntry {
  code: string       // indexed, unique — e.g. "RX001"
  display: string    // indexed — drug name
  form: string
  strength: string
  atcCode?: string   // optional — for future ATC/RxNorm migration
  version: number
}

export interface VocabIcd10Entry {
  code: string       // indexed, unique — e.g. "A09"
  display: string    // indexed — diagnosis name
  version: number
}

export interface VocabInteractionEntry {
  id?: number        // auto-incremented
  drugA: string      // indexed
  drugB: string      // indexed
  severity: string
  description: string
  version: number
}

class OpdLiteDatabase extends Dexie {
  patients!: EntityTable<LocalPatient, 'id'>
  encounters!: EntityTable<LocalEncounter, 'id'>
  soapLedger!: EntityTable<SoapLedgerEntry, 'id'>
  observations!: EntityTable<LocalObservation, 'id'>
  conditions!: EntityTable<LocalCondition, 'id'>
  medications!: EntityTable<LocalMedicationRequest, 'id'>
  interactionAuditLog!: EntityTable<InteractionAuditEntry, 'id'>
  practitionerKeys!: EntityTable<PractitionerKeyEntry, 'publicKey'>
  syncQueue!: EntityTable<SyncQueueEntry, 'id'>
  clientAuditLog!: EntityTable<ClientAuditEvent, 'id'>
  allergyIntolerances!: EntityTable<LocalAllergyIntolerance, 'id'>
  medicationStatements!: EntityTable<LocalMedicationStatement, 'id'>
  vocabularyMedications!: EntityTable<VocabMedicationEntry, 'code'>
  vocabularyIcd10!: EntityTable<VocabIcd10Entry, 'code'>
  vocabularyInteractions!: EntityTable<VocabInteractionEntry, 'id'>

  constructor() {
    super('opd-lite')

    this.version(1).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
    })

    this.version(2).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(3).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
    })

    this.version(4).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(5).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
    })

    this.version(6).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(7).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
    })

    this.version(8).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
    })

    this.version(9).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    this.version(10).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      dispenseAuditLog:
        'id, dispenseId, patientRef, pharmacistRef, action, createdAt',
    })

    this.version(11).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      dispenseAuditLog:
        'id, dispenseId, patientRef, pharmacistRef, action, createdAt',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
    })

    // v12: Remove pharmacy-specific tables (dispenses, dispenseAuditLog)
    // Pharmacy fulfillment now lives in pharmacy-lite (Story 4.4)
    this.version(12).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      dispenses: null,
      dispenseAuditLog: null,
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
    })

    // v13: Client-side audit ledger (Story 8.1)
    // Not encrypted — contains only opaque IDs, no PHI.
    this.version(13).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
    })

    // v14: Vocabulary tables for Dexie-backed terminology service (Story 10.3)
    // Not encrypted — vocabulary is non-PHI reference data.
    this.version(14).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
    })

    // v15: AllergyIntolerance table (Story 10.2)
    // Tier 1 safety-critical — append-only merge in sync engine.
    // Encrypted: contains substance info (PHI).
    this.version(15).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
      allergyIntolerances:
        'id, patient.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
    })

    // v16: MedicationStatement cache for cross-encounter interaction checks (Story 10.1)
    // Encrypted — contains medication names (clinical content).
    this.version(16).stores({
      patients:
        'id, _ultranos.nameLocal, _ultranos.nationalIdHash, _ultranos.nameLatin, meta.lastUpdated',
      encounters:
        'id, status, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      soapLedger:
        'id, encounterId, hlcTimestamp',
      observations:
        'id, encounter.reference, subject.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      conditions:
        'id, encounter.reference, subject.reference, _ultranos.diagnosisRank, meta.lastUpdated',
      medications:
        'id, status, subject.reference, encounter.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      interactionAuditLog:
        'id, encounterId, patientId, medicationRequestId, checkResult, createdAt',
      practitionerKeys:
        'publicKey, practitionerId',
      syncQueue:
        'id, resourceType, resourceId, status, createdAt',
      clientAuditLog:
        'id, status, queuedAt, [status+queuedAt]',
      vocabularyMedications:
        '&code, display, form, version',
      vocabularyIcd10:
        '&code, display, version',
      vocabularyInteractions:
        '++id, drugA, drugB, version',
      allergyIntolerances:
        'id, patient.reference, _ultranos.hlcTimestamp, meta.lastUpdated',
      medicationStatements:
        'id, status, subject.reference, _ultranos.sourcePrescriptionId, _ultranos.hlcTimestamp, meta.lastUpdated',
    })
  }
}

/**
 * PHI tables that require field-level encryption via AES-256-GCM.
 * Indexed fields remain in cleartext for Dexie queries; all other
 * fields are encrypted into a single `_enc` blob in IndexedDB.
 *
 * Non-PHI tables (syncQueue, practitionerKeys) are NOT encrypted —
 * they contain operational data (opaque IDs, timestamps) rather than
 * clinical content. Audit tables are encrypted because they contain
 * medicationDisplay and patient references (clinical content).
 */
const PHI_TABLE_CONFIGS: EncryptionTableConfig[] = [
  {
    tableName: 'patients',
    indexedFields: [
      'id',
      '_ultranos.nameLocal',
      '_ultranos.nationalIdHash',
      '_ultranos.nameLatin',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'encounters',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'soapLedger',
    indexedFields: ['id', 'encounterId', 'hlcTimestamp'],
  },
  {
    tableName: 'observations',
    indexedFields: [
      'id',
      'encounter.reference',
      'subject.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'conditions',
    indexedFields: [
      'id',
      'encounter.reference',
      'subject.reference',
      '_ultranos.diagnosisRank',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'medications',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      'encounter.reference',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'allergyIntolerances',
    indexedFields: [
      'id',
      'patient.reference',
      'clinicalStatus.coding[0].code',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'medicationStatements',
    indexedFields: [
      'id',
      'status',
      'subject.reference',
      '_ultranos.sourcePrescriptionId',
      '_ultranos.hlcTimestamp',
      'meta.lastUpdated',
    ],
  },
  {
    tableName: 'interactionAuditLog',
    indexedFields: [
      'id',
      'encounterId',
      'patientId',
      'medicationRequestId',
      'checkResult',
      'createdAt',
    ],
  },
]

export const db = new OpdLiteDatabase()

applyEncryptionMiddleware(db, PHI_TABLE_CONFIGS)

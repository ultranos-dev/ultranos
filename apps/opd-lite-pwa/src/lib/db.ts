import Dexie, { type EntityTable } from 'dexie'
import type { FhirPatient, FhirEncounterZod, FhirObservation, FhirCondition, FhirMedicationRequestZod } from '@ultranos/shared-types'
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
}

export interface PractitionerKeyEntry {
  publicKey: string          // base64-encoded Ed25519 public key (primary key)
  practitionerId: string
  practitionerName: string
  cachedAt: string           // ISO 8601 timestamp
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

  constructor() {
    super('opd-lite-pwa')

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
    // Pharmacy fulfillment now lives in pharmacy-lite-pwa (Story 4.4)
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

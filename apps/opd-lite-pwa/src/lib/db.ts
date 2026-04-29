import Dexie, { type EntityTable } from 'dexie'
import type { FhirPatient, FhirEncounterZod, FhirObservation, FhirCondition, FhirMedicationRequestZod } from '@ultranos/shared-types'

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

class OpdLiteDatabase extends Dexie {
  patients!: EntityTable<LocalPatient, 'id'>
  encounters!: EntityTable<LocalEncounter, 'id'>
  soapLedger!: EntityTable<SoapLedgerEntry, 'id'>
  observations!: EntityTable<LocalObservation, 'id'>
  conditions!: EntityTable<LocalCondition, 'id'>
  medications!: EntityTable<LocalMedicationRequest, 'id'>
  interactionAuditLog!: EntityTable<InteractionAuditEntry, 'id'>

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
  }
}

export const db = new OpdLiteDatabase()

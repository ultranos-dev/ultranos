import Dexie, { type EntityTable } from 'dexie'
import type { FhirPatient, FhirEncounterZod, FhirObservation, FhirCondition } from '@ultranos/shared-types'

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

class OpdLiteDatabase extends Dexie {
  patients!: EntityTable<LocalPatient, 'id'>
  encounters!: EntityTable<LocalEncounter, 'id'>
  soapLedger!: EntityTable<SoapLedgerEntry, 'id'>
  observations!: EntityTable<LocalObservation, 'id'>
  conditions!: EntityTable<LocalCondition, 'id'>

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
  }
}

export const db = new OpdLiteDatabase()

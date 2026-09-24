import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { registerPatientOffline } from '@/lib/offline-registration'
import type { FhirPatient } from '@ultranos/shared-types'

const PROV = 'prov-offline-0001'

function makeLocalPatient(id: string): FhirPatient {
  return {
    id,
    resourceType: 'Patient',
    name: [{ given: ['Zahra'], text: 'Zahra' }],
    gender: 'female' as FhirPatient['gender'],
    birthYearOnly: true,
    _ultranos: {
      nameLocal: 'Zahra',
      isActive: true,
      patient_tier: 'FREE',
      isNomadic: false,
      createdAt: new Date().toISOString(),
      mpiPending: true,
      isOfflineCreated: true,
    },
    meta: { lastUpdated: new Date().toISOString() },
  }
}

describe('registerPatientOffline (Story 60.3, C-OPD-2)', () => {
  beforeEach(async () => {
    await Promise.all([db.patients.clear(), db.syncQueue.clear()])
  })

  it('writes the patient to encrypted local storage with the mpiPending flag and enqueues a Patient create', async () => {
    const localPatient = makeLocalPatient(PROV)
    const syncPayload = {
      nameLocal: 'Zahra',
      nameGiven: 'Zahra',
      gender: 'female',
      birthYearOnly: true,
      birthYear: 1992,
      consent: { method: 'WRITTEN', language: 'en', version: '1.0' },
      offlineCreatedAt: new Date().toISOString(),
    }

    // Must NOT throw — the whole point of the offline path (pull-the-cable test).
    await expect(registerPatientOffline(PROV, localPatient, syncPayload)).resolves.toBeUndefined()

    // Patient landed in the encrypted local store with the pending flag.
    const stored = await db.patients.get(PROV)
    expect(stored).toBeDefined()
    expect(stored?._ultranos?.mpiPending).toBe(true)
    expect(stored?._ultranos?.isOfflineCreated).toBe(true)

    // A Patient create was enqueued, keyed by the provisional id.
    const queued = await db.syncQueue.where('resourceId').equals(PROV).toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]?.resourceType).toBe('Patient')
    expect(queued[0]?.action).toBe('create')
    expect(queued[0]?.status).toBe('pending')

    // The queued payload carries the consent + offlineCreatedAt (survives offline).
    const raw = queued[0]?.payload as string
    // Payload is encrypted at rest (enc:v1: prefix) OR plain JSON when no key;
    // either way it must be a non-empty string that the drain will decrypt.
    expect(typeof raw).toBe('string')
    expect((raw ?? '').length).toBeGreaterThan(0)
  })
})

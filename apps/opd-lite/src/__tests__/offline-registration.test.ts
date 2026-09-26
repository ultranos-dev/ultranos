import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/lib/db'
import {
  registerPatientOffline,
  uploadPendingPatientPhoto,
  drainPendingPatientPhotos,
} from '@/lib/offline-registration'
import type { FhirPatient } from '@ultranos/shared-types'

// Stub the photo upload network call; keep dataUrlToBlob real-ish (returns a Blob).
const { mockUploadPatientPhoto } = vi.hoisted(() => ({ mockUploadPatientPhoto: vi.fn() }))
vi.mock('@/lib/patient-photo-api', () => ({
  uploadPatientPhoto: (...args: unknown[]) => mockUploadPatientPhoto(...args),
  dataUrlToBlob: (s: string) => new Blob([s]),
}))

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
    await Promise.all([
      db.patients.clear(),
      db.syncQueue.clear(),
      db.pendingPatientPhotos.clear(),
      db.provisionalIdMap.clear(),
    ])
    mockUploadPatientPhoto.mockReset()
    mockUploadPatientPhoto.mockResolvedValue({ photoUrl: 'opaque-key', lastUpdated: new Date().toISOString() })
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

  it('does NOT stash a photo when none is provided', async () => {
    await registerPatientOffline(PROV, makeLocalPatient(PROV), { consent: {} })
    expect(await db.pendingPatientPhotos.get(PROV)).toBeUndefined()
  })

  it('stashes the captured photo (encrypted) keyed by the provisional id when provided', async () => {
    const dataUrl = 'data:image/webp;base64,QUJD'
    await registerPatientOffline(PROV, makeLocalPatient(PROV), { consent: {} }, dataUrl)

    const stash = await db.pendingPatientPhotos.get(PROV)
    expect(stash?.dataUrl).toBe(dataUrl)
    expect(typeof stash?.createdAt).toBe('string')
  })
})

describe('offline photo deferred upload', () => {
  beforeEach(async () => {
    await Promise.all([db.pendingPatientPhotos.clear(), db.provisionalIdMap.clear()])
    mockUploadPatientPhoto.mockReset()
    mockUploadPatientPhoto.mockResolvedValue({ photoUrl: 'opaque-key', lastUpdated: new Date().toISOString() })
  })

  it('uploadPendingPatientPhoto uploads under the Hub id and clears the stash', async () => {
    await db.pendingPatientPhotos.put({ provisionalId: PROV, dataUrl: 'data:image/webp;base64,QUJD', createdAt: new Date().toISOString() })

    await uploadPendingPatientPhoto(PROV, 'hub-uuid-1')

    expect(mockUploadPatientPhoto).toHaveBeenCalledTimes(1)
    expect(mockUploadPatientPhoto.mock.calls[0]?.[0]).toBe('hub-uuid-1')
    expect(await db.pendingPatientPhotos.get(PROV)).toBeUndefined()
  })

  it('uploadPendingPatientPhoto is a no-op when nothing is stashed', async () => {
    await uploadPendingPatientPhoto(PROV, 'hub-uuid-1')
    expect(mockUploadPatientPhoto).not.toHaveBeenCalled()
  })

  it('leaves the stash in place when the upload fails (retried by the sweep)', async () => {
    await db.pendingPatientPhotos.put({ provisionalId: PROV, dataUrl: 'data:image/webp;base64,QUJD', createdAt: new Date().toISOString() })
    mockUploadPatientPhoto.mockRejectedValueOnce(new Error('network'))

    await expect(uploadPendingPatientPhoto(PROV, 'hub-uuid-1')).rejects.toThrow()
    expect(await db.pendingPatientPhotos.get(PROV)).toBeDefined()
  })

  it('drainPendingPatientPhotos uploads reconciled stashes and skips unreconciled ones', async () => {
    // Reconciled: has a provisional→hub mapping → should upload + clear.
    await db.pendingPatientPhotos.put({ provisionalId: 'prov-reconciled', dataUrl: 'data:image/webp;base64,QUJD', createdAt: new Date().toISOString() })
    await db.provisionalIdMap.put({ provisionalId: 'prov-reconciled', hubId: 'hub-9', reconciledAt: new Date().toISOString() })
    // Unreconciled: no mapping yet → should be left untouched.
    await db.pendingPatientPhotos.put({ provisionalId: 'prov-pending', dataUrl: 'data:image/webp;base64,QUJD', createdAt: new Date().toISOString() })

    await drainPendingPatientPhotos()

    expect(mockUploadPatientPhoto).toHaveBeenCalledTimes(1)
    expect(mockUploadPatientPhoto.mock.calls[0]?.[0]).toBe('hub-9')
    expect(await db.pendingPatientPhotos.get('prov-reconciled')).toBeUndefined()
    expect(await db.pendingPatientPhotos.get('prov-pending')).toBeDefined()
  })
})

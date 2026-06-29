import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { FhirPatient } from '@ultranos/shared-types'

// Controllable Supabase session token for the Hub-fetch path.
const { supabaseState } = vi.hoisted(() => ({
  supabaseState: { token: undefined as string | undefined },
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: {
          session: supabaseState.token
            ? { access_token: supabaseState.token }
            : null,
        },
      }),
    },
  }),
}))

import { loadPatientResilient } from '@/lib/patient-loader'

function makeHubRow(id: string, nameLocal: string): Record<string, unknown> {
  return {
    id,
    resourceType: 'Patient',
    name: [{ text: nameLocal }],
    gender: 'male',
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal,
      nameLatin: 'Latin Name',
      isNomadic: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    meta: { lastUpdated: '2026-01-01T00:00:00.000Z' },
  }
}

function makeLocalPatient(id: string, nameLocal: string): FhirPatient {
  return {
    id,
    resourceType: 'Patient',
    name: [{ text: nameLocal }],
    gender: 'male' as FhirPatient['gender'],
    birthDate: '1985-03-15',
    birthYearOnly: false,
    _ultranos: {
      nameLocal,
      isNomadic: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    meta: { lastUpdated: '2026-01-01T00:00:00.000Z' },
  } as FhirPatient
}

describe('loadPatientResilient', () => {
  beforeEach(async () => {
    await db.patients.clear()
    supabaseState.token = undefined
    vi.restoreAllMocks()
    if (!encryptionKeyStore.isReady()) {
      const { generateSessionKey } = await import('@ultranos/crypto')
      encryptionKeyStore.setKey(await generateSessionKey())
    }
  })

  it('loads the patient from the Hub when it is absent from local Dexie', async () => {
    // The known Patient sync-pull gap: the patient is NOT in IndexedDB.
    supabaseState.token = 'test-token'
    const hubRow = makeHubRow('hub-only', 'Hub Patient')
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { data: { json: hubRow } } }),
    })) as unknown as typeof fetch

    const result = await loadPatientResilient('hub-only')

    expect(result.patient?.id).toBe('hub-only')
    expect(result.patient?._ultranos.nameLocal).toBe('Hub Patient')
    expect(result.needsReauth).toBe(false)
  })

  it('returns needsReauth when the encryption key is unavailable', async () => {
    encryptionKeyStore.wipe()

    const result = await loadPatientResilient('any-id')

    expect(result.patient).toBeNull()
    expect(result.needsReauth).toBe(true)
  })

  it('returns the local patient from Dexie without hitting the Hub', async () => {
    await db.patients.add(makeLocalPatient('local-1', 'Local Patient'))
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch

    const result = await loadPatientResilient('local-1')

    expect(result.patient?.id).toBe('local-1')
    expect(result.patient?._ultranos.nameLocal).toBe('Local Patient')
    expect(result.needsReauth).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

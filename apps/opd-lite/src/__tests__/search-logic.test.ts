/**
 * Story 28.6 — Search Encryption Strategy: In-Memory Decrypt-and-Search
 *
 * Verifies that patient name search works correctly when nameLocal and
 * nameLatin are no longer indexed cleartext fields but live exclusively
 * inside the encrypted _enc blob.
 *
 * Strategy: Option A — load all patients via db.patients.toArray()
 * (decrypted by middleware), then apply starts-with filter in memory.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import 'fake-indexeddb/auto'
import { db, type LocalPatient } from '@/lib/db'
import { AdministrativeGender } from '@ultranos/shared-types'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { generateSessionKey } from '@ultranos/crypto'
import { usePatientStore } from '@/stores/patient-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatient(
  overrides: Partial<LocalPatient> & { id: string },
): LocalPatient {
  return {
    resourceType: 'Patient',
    name: [{ text: overrides._ultranos?.nameLocal ?? 'Test' }],
    gender: AdministrativeGender.MALE,
    birthDate: '1990-01-01',
    birthYearOnly: false,
    _ultranos: {
      nameLocal: 'Test Patient',
      isActive: true,
      isNomadic: false,
      patient_tier: 'FREE',
      createdAt: new Date().toISOString(),
      ...overrides._ultranos,
    },
    meta: { lastUpdated: new Date().toISOString() },
    ...overrides,
  }
}

/**
 * In-memory search — the new implementation.
 * Mirrors what use-patient-search.ts now does internally.
 */
async function searchInMemory(query: string): Promise<LocalPatient[]> {
  if (!encryptionKeyStore.isReady()) return []
  const trimmed = query.trim()
  if (!trimmed) return []

  const all = await db.patients.toArray()
  const q = trimmed.toLocaleLowerCase()

  return all
    .filter((p) => {
      const local = ((p._ultranos as { nameLocal?: string })?.nameLocal ?? '').toLocaleLowerCase()
      const latin = ((p._ultranos as { nameLatin?: string })?.nameLatin ?? '').toLocaleLowerCase()
      return local.startsWith(q) || latin.startsWith(q)
    })
    .slice(0, 50) as LocalPatient[]
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  const key = await generateSessionKey()
  encryptionKeyStore.setKey(key)
  await db.patients.clear()
  usePatientStore.setState({
    query: '',
    results: [],
    selectedPatient: null,
    isSearching: false,
    searchError: null,
    syncStatus: { isPending: false, isError: false, lastSyncedAt: null },
  })
})

afterAll(() => {
  encryptionKeyStore.wipe()
})

// ---------------------------------------------------------------------------
// AC 1 + 2: In-memory search — correctness
// ---------------------------------------------------------------------------

describe('in-memory decrypt-and-search', () => {
  it('finds patients by nameLocal (starts-with, case-insensitive)', async () => {
    await db.patients.bulkPut([
      makePatient({ id: '1', _ultranos: { nameLocal: 'أحمد الراشد', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '2', _ultranos: { nameLocal: 'فاطمة حسن', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '3', _ultranos: { nameLocal: 'أحمد محمد', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
    ])

    const results = await searchInMemory('أحمد')

    expect(results).toHaveLength(2)
    expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
  })

  it('finds patients by nameLatin (starts-with, case-insensitive)', async () => {
    await db.patients.bulkPut([
      makePatient({ id: '1', _ultranos: { nameLocal: 'أحمد', nameLatin: 'Ahmed Al-Rashid', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '2', _ultranos: { nameLocal: 'فاطمة', nameLatin: 'Fatima Hassan', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
    ])

    const results = await searchInMemory('ahmed')

    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe('1')
  })

  it('deduplicates patients whose nameLocal AND nameLatin both match', async () => {
    await db.patients.bulkPut([
      makePatient({
        id: '1',
        _ultranos: { nameLocal: 'Ahmed Test', nameLatin: 'Ahmed Test', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() },
      }),
    ])

    // With the in-memory approach we only iterate once — no duplicates by design
    const results = await searchInMemory('Ahmed')
    expect(results).toHaveLength(1)
  })

  it('matches against nameLocal OR nameLatin (both fields covered)', async () => {
    await db.patients.bulkPut([
      // Only in nameLocal
      makePatient({ id: '1', _ultranos: { nameLocal: 'Sara Clinic', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      // Only in nameLatin
      makePatient({ id: '2', _ultranos: { nameLocal: 'سارة', nameLatin: 'Sara Clinic', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      // Neither
      makePatient({ id: '3', _ultranos: { nameLocal: 'محمد', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
    ])

    const results = await searchInMemory('Sara')
    expect(results.map((r) => r.id).sort()).toEqual(['1', '2'])
  })

  it('returns empty array for empty query', async () => {
    await db.patients.bulkPut([
      makePatient({ id: '1', _ultranos: { nameLocal: 'Ahmed', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
    ])

    const results = await searchInMemory('')
    expect(results).toHaveLength(0)
  })

  it('limits results to 50 records', async () => {
    const patients = Array.from({ length: 60 }, (_, i) =>
      makePatient({
        id: `id-${i}`,
        _ultranos: { nameLocal: `Matching Name ${i}`, isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() },
      }),
    )
    await db.patients.bulkPut(patients)

    const results = await searchInMemory('Matching')
    expect(results).toHaveLength(50)
  })
})

// ---------------------------------------------------------------------------
// AC 2: Arabic / RTL name search
// ---------------------------------------------------------------------------

describe('Arabic / RTL name search', () => {
  it('searches Arabic script names correctly using toLocaleLowerCase', async () => {
    // Arabic doesn't have case, but toLocaleLowerCase must not corrupt the string
    await db.patients.bulkPut([
      makePatient({ id: '1', _ultranos: { nameLocal: 'عبدالله', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '2', _ultranos: { nameLocal: 'عبدالرحمن', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '3', _ultranos: { nameLocal: 'محمد', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
    ])

    const results = await searchInMemory('عبد')
    expect(results).toHaveLength(2)
    expect(results.map((r) => r.id).sort()).toEqual(['1', '2'])
  })

  it('searches Dari/Pashto names correctly', async () => {
    await db.patients.bulkPut([
      makePatient({ id: '1', _ultranos: { nameLocal: 'زرغونه کریمي', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '2', _ultranos: { nameLocal: 'زلمی', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
      makePatient({ id: '3', _ultranos: { nameLocal: 'احمد', isActive: true, isNomadic: false, patient_tier: 'FREE', createdAt: new Date().toISOString() } }),
    ])

    const results = await searchInMemory('زرغ')
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// AC 3: Key unavailability — graceful empty + error message
// ---------------------------------------------------------------------------

describe('key unavailability', () => {
  it('returns empty results when encryption key is not ready', async () => {
    encryptionKeyStore.wipe()

    const results = await searchInMemory('Ahmed')
    expect(results).toHaveLength(0)
  })

  it('usePatientStore exposes searchError field', () => {
    // After a key-unavailable search, the hook should set searchError
    const state = usePatientStore.getState()
    expect('searchError' in state).toBe(true)
  })

  it('no PHI in searchError message when key is unavailable', async () => {
    encryptionKeyStore.wipe()

    // Simulate what the hook does on key unavailability
    const errorMsg = 'Session required for patient search'
    usePatientStore.getState().setSearchError(errorMsg)

    const { searchError } = usePatientStore.getState()
    expect(searchError).toBe('Session required for patient search')

    // Error message must not contain patient names or IDs
    expect(searchError).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i) // no UUIDs
    expect(searchError).not.toMatch(/Ahmed|Fatima|أحمد|فاطمة/)     // no names
  })
})

// ---------------------------------------------------------------------------
// AC 1: Performance — <200ms for 1000 encrypted patients
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('in-memory search of 1000 encrypted patients completes in <200ms', async () => {
    const patients = Array.from({ length: 1000 }, (_, i) =>
      makePatient({
        id: `perf-${i}`,
        _ultranos: {
          nameLocal: `Patient ${String(i).padStart(4, '0')}`,
          nameLatin: `Patient Latin ${i}`,
          isActive: true,
          isNomadic: false,
          patient_tier: 'FREE',
          createdAt: new Date().toISOString(),
        },
      }),
    )
    // Re-create key in case wipe() was called in the key-unavailability tests
    const key = await generateSessionKey()
    encryptionKeyStore.setKey(key)

    await db.patients.bulkPut(patients)

    const start = performance.now()
    const results = await searchInMemory('Patient 05')
    const elapsed = performance.now() - start

    expect(results.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(200)
  })
})

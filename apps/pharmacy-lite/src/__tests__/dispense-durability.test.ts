import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { generateSessionKey } from '@ultranos/crypto'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'

// Mock global fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Mutable token so we can simulate "no token → re-auth → token present".
let currentToken: string | null = 'test-token'
const mockGetAccessToken = vi.fn().mockImplementation(async () => currentToken)
const mockGetPractitionerRef = vi.fn().mockReturnValue('Practitioner/practitioner-abc-123')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: { userId: 'u1', practitionerId: 'practitioner-abc-123', role: 'PHARMACIST', sessionId: 's1', email: 'pharm@test.local' },
      getPractitionerRef: mockGetPractitionerRef,
      getAccessToken: mockGetAccessToken,
    }),
  },
}))

const { syncDispenseToHub } = await import('@/lib/dispense-sync')
const { sweepOrphanedDispenses } = await import('@/lib/dispense-sweep')
const { drainSyncFn } = await import('@/lib/drain-sync-fn')

function makeDispense(id = 'dispense-001', prescriptionId = 'rx-001'): LocalMedicationDispense {
  return {
    id,
    resourceType: 'MedicationDispense',
    status: 'completed',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:medication', code: 'AMX500', display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    subject: { reference: 'Patient/pat-001' },
    performer: [{ actor: { reference: 'Practitioner/practitioner-abc-123' } }],
    authorizingPrescription: [{ reference: `MedicationRequest/${prescriptionId}` }],
    whenHandedOver: '2026-04-29T12:00:00Z',
    dosageInstruction: [{ text: '1 capsule, 3× per day, for 7 days' }],
    _ultranos: { hlcTimestamp: '000001714400000:00000:node-abc', createdAt: '2026-04-29T12:00:00Z', isOfflineCreated: true },
    meta: { lastUpdated: '2026-04-29T12:00:00Z', versionId: '1' },
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  fetchMock.mockReset() // clear any queued mockResolvedValueOnce from a prior test
  currentToken = 'test-token'
  encryptionKeyStore.setKey(await generateSessionKey())
  await db.delete()
  await db.open()
})

afterEach(() => {
  encryptionKeyStore.wipe()
  vi.unstubAllGlobals()
  vi.stubGlobal('fetch', fetchMock)
})

describe('Story 57.3 — dispense durability (H-PHARM-1)', () => {
  it('no-token dispense is queued, then drains successfully after re-auth (AC #1)', async () => {
    // 1. No live token at dispense time (offline shift, expired token).
    currentToken = null
    const dispense = makeDispense()
    await db.dispenses.put(dispense)
    const result = await syncDispenseToHub(dispense)

    expect(result.queued).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    const queued = await db.syncQueue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]!.resourceId).toBe('dispense-001')
    expect(queued[0]!.status).toBe('pending')

    // 2. Re-auth restores the token; the drain pushes the queued entry to the Hub.
    currentToken = 'fresh-token'
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: { json: { success: true } } } }),
    })

    // The drain worker decrypts the payload in-memory before pushing; mirror that
    // here (drainSyncFn expects a plaintext JSON payload).
    const { decryptPharmacyEntryPayload } = await import('@/lib/dexie-sync-adapter')
    const entry = queued[0]!
    const decrypted = await decryptPharmacyEntryPayload(entry.payload)
    const drainResult = await drainSyncFn({ ...entry, payload: decrypted, action: 'create', status: 'pending' })
    expect(drainResult.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
    const url = fetchMock.mock.calls[0]![0] as string
    expect(url).toContain('medication.recordDispense')
  })

  it('sweep re-enqueues an orphaned dispense with no queue entry (AC #5)', async () => {
    // A dispense exists in db.dispenses but was never queued (silent enqueue failure).
    await db.dispenses.put(makeDispense('orphan-1', 'rx-orphan'))
    expect(await db.syncQueue.count()).toBe(0)

    const n = await sweepOrphanedDispenses()
    expect(n).toBe(1)

    const queued = await db.syncQueue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]!.resourceId).toBe('orphan-1')
    expect(queued[0]!.status).toBe('pending')
  })

  it('sweep does NOT re-enqueue a dispense that already has a queue entry (idempotent)', async () => {
    const d = makeDispense('has-entry', 'rx-x')
    await db.dispenses.put(d)
    // Simulate an existing queue entry (any status).
    await db.syncQueue.put({
      id: 'q1', resourceType: 'MedicationDispense', resourceId: 'has-entry',
      action: 'dispense_sync', payload: '{}', status: 'failed',
      hlcTimestamp: d._ultranos.hlcTimestamp, createdAt: 'now', retryCount: 3,
    })

    const n = await sweepOrphanedDispenses()
    expect(n).toBe(0)
    expect(await db.syncQueue.count()).toBe(1) // unchanged
  })

  it('drainSyncFn flags a permanent 4xx as non-retryable, but not a 5xx (AC #4 / Low #24)', async () => {
    currentToken = 'tok'
    const entry = {
      id: 'e1', resourceType: 'MedicationDispense', resourceId: 'd1',
      action: 'create' as const, payload: '{"dispenseId":"d1"}', status: 'pending' as const,
      hlcTimestamp: '000001714400000:00000:node-abc', createdAt: 'now', retryCount: 0,
    }

    fetchMock.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) })
    const permanent = await drainSyncFn(entry)
    expect(permanent.success).toBe(false)
    expect(permanent.permanent).toBe(true)

    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
    const transient = await drainSyncFn(entry)
    expect(transient.success).toBe(false)
    expect(transient.permanent).toBeFalsy()

    // 429 (rate limit) is a transient 4xx — must remain retryable.
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
    const rateLimited = await drainSyncFn(entry)
    expect(rateLimited.permanent).toBeFalsy()
  })
})

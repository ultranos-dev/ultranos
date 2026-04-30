import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { db } from '@/lib/db'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'

// Mock global fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Import after mocks
const { syncDispenseToHub } = await import('@/lib/dispense-sync')

function makeSampleDispense(overrides?: Partial<LocalMedicationDispense>): LocalMedicationDispense {
  return {
    id: 'dispense-001',
    resourceType: 'MedicationDispense',
    status: 'completed',
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:medication', code: 'AMX500', display: 'Amoxicillin' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    subject: { reference: 'Patient/pat-001' },
    performer: [{ actor: { reference: 'Practitioner/pharmacist-001' } }],
    authorizingPrescription: [{ reference: 'MedicationRequest/rx-001' }],
    whenHandedOver: '2026-04-29T12:00:00Z',
    dosageInstruction: [{ text: '1 capsule, 3× per day, for 7 days' }],
    _ultranos: {
      hlcTimestamp: '000001714400000:00000:node-abc',
      createdAt: '2026-04-29T12:00:00Z',
      brandName: 'Amoxil',
      batchLot: 'LOT-A',
      isOfflineCreated: false,
    },
    meta: { lastUpdated: '2026-04-29T12:00:00Z', versionId: '1' },
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.delete()
  await db.open()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.stubGlobal('fetch', fetchMock)
})

describe('syncDispenseToHub', () => {
  it('sends dispense to Hub API via tRPC mutation when online', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: { success: true, dispenseId: 'dispense-001', prescriptionStatus: 'completed' },
          },
        },
      }),
    })

    const dispense = makeSampleDispense()
    const result = await syncDispenseToHub(dispense)

    expect(result.synced).toBe(true)
    expect(result.queued).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Verify the request was a POST to the recordDispense endpoint
    const fetchCall = fetchMock.mock.calls[0]!
    expect(fetchCall[0]).toContain('medication.recordDispense')
    expect(fetchCall[1]?.method).toBe('POST')
  })

  it('queues dispense in sync_queue when Hub is unreachable (offline)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'))

    const dispense = makeSampleDispense({ _ultranos: {
      ...makeSampleDispense()._ultranos,
      isOfflineCreated: true,
    } })

    const result = await syncDispenseToHub(dispense)

    expect(result.synced).toBe(false)
    expect(result.queued).toBe(true)

    // Verify it was saved to sync_queue
    const queued = await db.syncQueue.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]!.resourceType).toBe('MedicationDispense')
    expect(queued[0]!.resourceId).toBe('dispense-001')
    expect(queued[0]!.status).toBe('pending')
  })

  it('queues dispense when fetch returns a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 })

    const dispense = makeSampleDispense()
    const result = await syncDispenseToHub(dispense)

    expect(result.synced).toBe(false)
    expect(result.queued).toBe(true)

    const queued = await db.syncQueue.toArray()
    expect(queued).toHaveLength(1)
  })

  it('includes prescriptionId extracted from authorizingPrescription ref', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: {
            json: { success: true, dispenseId: 'dispense-001', prescriptionStatus: 'completed' },
          },
        },
      }),
    })

    const dispense = makeSampleDispense()
    await syncDispenseToHub(dispense)

    const body = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)
    expect(body.json.prescriptionId).toBe('rx-001')
  })

  it('stores the full dispense payload in sync_queue for later retry', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))

    const dispense = makeSampleDispense()
    await syncDispenseToHub(dispense)

    const queued = await db.syncQueue.toArray()
    expect(queued[0]!.payload).toBeTruthy()
    const payload = JSON.parse(queued[0]!.payload)
    expect(payload.dispenseId).toBe('dispense-001')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const entries = [
  {
    id: 'Specimen-spec-1-1',
    resourceType: 'Specimen',
    resourceId: 'spec-1',
    status: 'pending',
    payload: {
      id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890', resourceType: 'Specimen', status: 'available',
      type: { coding: [{ code: 'blood', display: 'blood' }] },
      subject: { reference: 'Patient/hmac-abc123' },
      request: [{ reference: 'ServiceRequest/order-abc' }],
      receivedTime: '2026-09-14T09:00:00.000Z',
      collection: { collector: { reference: 'Practitioner/courier-1' } },
      note: [{ text: 'left arm draw' }],
      _ultranos: {
        labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received',
        sampleCondition: 'acceptable', hlcTimestamp: 'hlc-1',
      },
    },
    createdAt: 't', lastAttemptAt: null, retryCount: 0,
  },
]
const update = vi.fn()
const fakeQueue = {
  where: () => ({ equals: () => ({ filter: (fn: any) => ({ toArray: async () => entries.filter(fn) }) }) }),
  update,
}
vi.mock('@/lib/db', () => ({ getDb: () => ({ syncQueue: fakeQueue }) }))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub' }))

const { drainSpecimenSyncQueue } = await import('../lib/specimen-sync')

describe('drainSpecimenSyncQueue', () => {
  beforeEach(() => { vi.clearAllMocks(); ;(global as any).fetch = vi.fn() })

  it('maps FhirSpecimen → submitSpecimen DTO and marks synced on 2xx', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true })
    const res = await drainSpecimenSyncQueue(async () => 'tok')
    expect(global.fetch).toHaveBeenCalledWith('http://hub/lab.submitSpecimen', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.json).toMatchObject({
      id: 'a1b2c3d4-e5f6-4890-abcd-ef1234567890', labSampleId: 'LAB-20260914-0001', pipelineStatus: 'received',
      fhirStatus: 'available', specimenType: 'blood', subjectReference: 'Patient/hmac-abc123',
      serviceRequestRef: 'ServiceRequest/order-abc', receivedFrom: 'Practitioner/courier-1',
      condition: 'acceptable', note: 'left arm draw', hlcTimestamp: 'hlc-1',
      receivedTime: '2026-09-14T09:00:00.000Z',
    })
    expect(update).toHaveBeenCalledWith('Specimen-spec-1-1', { status: 'synced' })
    expect(res).toEqual({ synced: 1, failed: 0 })
  })

  it('increments retryCount and leaves pending on failure', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 500 })
    const res = await drainSpecimenSyncQueue(async () => 'tok')
    expect(update).toHaveBeenCalledWith('Specimen-spec-1-1', expect.objectContaining({ retryCount: 1 }))
    expect(res).toEqual({ synced: 0, failed: 1 })
  })
})

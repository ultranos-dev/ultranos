import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SyncQueueEntry } from '@ultranos/sync-engine'

// Mock fetch
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// Mock auth session store
const mockGetAccessToken = vi.fn()
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      getAccessToken: mockGetAccessToken,
    }),
  },
}))

// Mock trpc
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: () => 'http://localhost:3000/api/trpc',
}))

const { drainSyncFn } = await import('@/lib/drain-sync-fn')

function makeEntry(overrides?: Partial<SyncQueueEntry>): SyncQueueEntry {
  return {
    id: 'entry-001',
    resourceType: 'MedicationDispense',
    resourceId: 'dispense-001',
    action: 'create',
    payload: JSON.stringify({
      dispenseId: 'dispense-001',
      prescriptionId: 'rx-001',
      medicationCode: 'AMX500',
      medicationDisplay: 'Amoxicillin 500mg',
      patientRef: 'Patient/pat-001',
      pharmacistRef: 'Practitioner/p1',
      whenHandedOver: '2026-05-10T10:00:00Z',
      hlcTimestamp: '000001714400000:00000:node-abc',
      status: 'completed',
    }),
    status: 'syncing',
    hlcTimestamp: '000001714400000:00000:node-abc',
    createdAt: '2026-05-10T10:00:00Z',
    retryCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAccessToken.mockResolvedValue('valid-token')
})

describe('drainSyncFn', () => {
  it('returns success on 200 response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: { data: { json: { success: true } } } }),
    })

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/trpc/medication.recordDispense',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      }),
    )
  })

  it('returns auth-expired when no token available', async () => {
    mockGetAccessToken.mockResolvedValue(null)

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: false, error: 'auth-expired' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns auth-expired on 401 response (AC #6)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: false, error: 'auth-expired' })
  })

  it('returns generic error on 409 response (conflict handling deferred to 26.4)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({}),
    })

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: false, error: 'Hub rejected with 409 Conflict' })
  })

  it('returns error on other HTTP failure codes', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: false, error: 'Hub sync failed: 500' })
  })

  it('surfaces the tRPC gate reason on 403 (e.g. KYC_REQUIRED)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { json: { message: 'KYC_REQUIRED' } } }),
    })

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: false, error: 'KYC_REQUIRED' })
  })

  it('falls back to the status on 403 with an unexpected body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    })

    const result = await drainSyncFn(makeEntry())

    expect(result).toEqual({ success: false, error: 'Hub sync failed: 403' })
  })

  it('throws on network error (propagates to DrainWorker catch)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(drainSyncFn(makeEntry())).rejects.toThrow('Failed to fetch')
  })

  it('returns invalid-payload error on corrupt JSON (P2)', async () => {
    const result = await drainSyncFn(makeEntry({ payload: '{not valid json' }))

    expect(result).toEqual({ success: false, error: 'invalid-payload' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends parsed payload as JSON body', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })

    const payload = {
      dispenseId: 'dispense-002',
      prescriptionId: 'rx-002',
      medicationCode: 'IBU400',
    }
    await drainSyncFn(makeEntry({ payload: JSON.stringify(payload) }))

    const [, opts] = fetchMock.mock.calls[0]
    expect(JSON.parse(opts.body)).toEqual({ json: payload })
  })
})

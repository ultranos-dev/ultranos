import type { SyncQueueEntry } from '@ultranos/sync-engine'
import { createDrainSyncFn } from '@/lib/drain-sync-fn'

// Mock hubFetch — drain-sync-fn now uses certificate-pinned fetch (Story 21.5)
const mockHubFetch = jest.fn()
jest.mock('@/lib/hub-fetch', () => ({
  hubFetch: (...args: unknown[]) => mockHubFetch(...args),
  CompromisedDeviceError: class extends Error { name = 'CompromisedDeviceError' },
}))

function makeEntry(overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry {
  return {
    id: 'entry-1',
    resourceType: 'Consent',
    resourceId: 'consent-1',
    action: 'create',
    payload: JSON.stringify({ resourceType: 'Consent', id: 'consent-1' }),
    status: 'syncing',
    hlcTimestamp: '000000000000001:00000:node-1',
    createdAt: '2026-05-12T00:00:00.000Z',
    retryCount: 0,
    ...overrides,
  }
}

describe('drain-sync-fn', () => {
  const getHubUrl = () => 'https://hub.ultranos.test'
  let getAuthToken: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    getAuthToken = jest.fn().mockResolvedValue('valid-token')
  })

  it('returns AUTH_EXPIRED when token is null', async () => {
    getAuthToken.mockResolvedValue(null)
    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    const result = await syncFn(makeEntry())

    expect(result.success).toBe(false)
    expect(result.error).toBe('AUTH_EXPIRED')
    expect(mockHubFetch).not.toHaveBeenCalled()
  })

  it('routes Consent to consent.sync endpoint', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    await syncFn(makeEntry({ resourceType: 'Consent' }))

    expect(mockHubFetch).toHaveBeenCalledWith(
      'https://hub.ultranos.test/api/consent.sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer valid-token',
        }),
      }),
    )
  })

  it('routes Patient to patient.update endpoint', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    await syncFn(makeEntry({ resourceType: 'Patient' }))

    expect(mockHubFetch).toHaveBeenCalledWith(
      'https://hub.ultranos.test/api/patient.update',
      expect.any(Object),
    )
  })

  it('routes unknown resource types to sync.push endpoint', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    await syncFn(makeEntry({ resourceType: 'Encounter' }))

    expect(mockHubFetch).toHaveBeenCalledWith(
      'https://hub.ultranos.test/api/sync.push',
      expect.any(Object),
    )
  })

  it('returns success on 200 response', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({}),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    const result = await syncFn(makeEntry())

    expect(result.success).toBe(true)
  })

  it('returns AUTH_EXPIRED on 401 response', async () => {
    mockHubFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    const result = await syncFn(makeEntry())

    expect(result.success).toBe(false)
    expect(result.error).toBe('AUTH_EXPIRED')
  })

  it('returns failure on non-OK response', async () => {
    mockHubFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers(),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    const result = await syncFn(makeEntry())

    expect(result.success).toBe(false)
    expect(result.error).toContain('500')
  })

  it('returns conflict when Hub reports one', async () => {
    mockHubFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({
        conflict: {
          remoteVersion: { id: 'remote-1', data: {}, hlcTimestamp: { wallMs: 1, counter: 0, nodeId: 'hub' }, version: '2' },
        },
      }),
    })

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    const result = await syncFn(makeEntry())

    expect(result.success).toBe(false)
    expect(result.conflict).toBeDefined()
    expect(result.conflict!.remoteVersion.id).toBe('remote-1')
  })

  it('handles network errors gracefully', async () => {
    mockHubFetch.mockRejectedValue(new Error('Network request failed'))

    const syncFn = createDrainSyncFn({ getAuthToken, getHubUrl })
    const result = await syncFn(makeEntry())

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network request failed')
  })
})

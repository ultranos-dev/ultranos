import { describe, it, expect, vi, beforeEach } from 'vitest'

const entries = [
  {
    id: 'DiagnosticReport-r1-1',
    resourceType: 'DiagnosticReport',
    resourceId: 'r1',
    status: 'pending',
    payload: { diagnosticReport: { id: 'r1' }, observations: [] },
    createdAt: 't',
    lastAttemptAt: null,
    retryCount: 0,
  },
]
const update = vi.fn()
const fakeQueue = {
  where: () => ({ equals: () => ({ filter: (fn: any) => ({ toArray: async () => entries.filter(fn) }) }) }),
  update,
}
vi.mock('@/lib/db', () => ({ getDb: () => ({ syncQueue: fakeQueue }) }))
vi.mock('@/lib/trpc', () => ({ getHubApiUrl: () => 'http://hub' }))
vi.mock('@ultranos/sync-engine', () => ({
  classifySyncFailure: (raw: string) => {
    if (raw && raw.includes('HTTP 4')) return 'serverRejected'
    if (raw && raw.includes('HTTP 5')) return 'serverError'
    return 'unknown'
  },
}))

const { drainResultSyncQueue } = await import('../lib/result-sync')

describe('drainResultSyncQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(global as any).fetch = vi.fn()
  })

  it('POSTs pending DiagnosticReport entries to lab.submitResult and marks them synced', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: true })
    const res = await drainResultSyncQueue(async () => 'tok')
    expect(global.fetch).toHaveBeenCalledWith('http://hub/lab.submitResult', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body)
    expect(body.json.diagnosticReport.id).toBe('r1') // tRPC input envelope { json: <bundle> }
    expect(update).toHaveBeenCalledWith('DiagnosticReport-r1-1', { status: 'synced' })
    expect(res).toEqual({ synced: 1, failed: 0 })
  })

  it('5xx → retryCount incremented, status NOT set to failed (transient)', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 500 })
    const res = await drainResultSyncQueue(async () => 'tok')
    expect(update).toHaveBeenCalledWith('DiagnosticReport-r1-1', expect.objectContaining({ retryCount: 1 }))
    const updateArg = update.mock.calls[0][1]
    expect(updateArg.status).toBeUndefined()
    expect(res).toEqual({ synced: 0, failed: 1 })
  })

  it('4xx (400) → entry dead-lettered: status:failed + failureReason set', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 400 })
    const res = await drainResultSyncQueue(async () => 'tok')
    expect(update).toHaveBeenCalledWith(
      'DiagnosticReport-r1-1',
      expect.objectContaining({ status: 'failed', failureReason: expect.any(String) }),
    )
    expect(res).toEqual({ synced: 0, failed: 1 })
  })

  it('429 → still pending (transient), retryCount incremented', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 429 })
    const res = await drainResultSyncQueue(async () => 'tok')
    expect(update).toHaveBeenCalledWith('DiagnosticReport-r1-1', expect.objectContaining({ retryCount: 1 }))
    const updateArg = update.mock.calls[0][1]
    expect(updateArg.status).toBeUndefined()
    expect(res).toEqual({ synced: 0, failed: 1 })
  })
})

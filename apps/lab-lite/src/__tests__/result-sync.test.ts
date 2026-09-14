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

  it('leaves entries pending and increments retryCount on failure', async () => {
    ;(global.fetch as any).mockResolvedValue({ ok: false, status: 500 })
    const res = await drainResultSyncQueue(async () => 'tok')
    expect(update).toHaveBeenCalledWith('DiagnosticReport-r1-1', expect.objectContaining({ retryCount: 1 }))
    expect(res).toEqual({ synced: 0, failed: 1 })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAccessToken = vi.fn().mockResolvedValue('pharm-token')
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ getAccessToken: mockGetAccessToken }) },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { getUnreadNotificationCount, listNotifications, acknowledgeNotification } = await import('@/lib/trpc')

function okJson(json: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => json })
}

describe('pharmacy notification client → generic notification.* endpoints', () => {
  beforeEach(() => { mockFetch.mockReset(); mockGetAccessToken.mockResolvedValue('pharm-token') })

  it('getUnreadNotificationCount hits notification.unreadCount and returns the count', async () => {
    okJson({ result: { data: { json: { count: 2 } } } })
    const count = await getUnreadNotificationCount()
    expect((mockFetch.mock.calls[0]![0] as string)).toContain('notification.unreadCount')
    expect(count).toBe(2)
  })

  it('getUnreadNotificationCount returns 0 on error (best-effort badge)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    expect(await getUnreadNotificationCount()).toBe(0)
  })

  it('listNotifications hits notification.list and unwraps the array', async () => {
    okJson({ result: { data: { json: { notifications: [{ id: 'n1', type: 'DISPENSE_REVIEW_RESOLVED', payload: {}, status: 'SENT', createdAt: 't', deliveredAt: null, acknowledgedAt: null }] } } } })
    const result = await listNotifications()
    expect((mockFetch.mock.calls[0]![0] as string)).toContain('notification.list')
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('DISPENSE_REVIEW_RESOLVED')
  })

  it('acknowledgeNotification POSTs notification.acknowledge with the id', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await acknowledgeNotification('n1')
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('notification.acknowledge')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({ json: { notificationId: 'n1' } })
  })
})

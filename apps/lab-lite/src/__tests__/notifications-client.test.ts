import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The lab notification client must call the generic `notification.*` Hub
 * procedures (which exist) — not the `lab.*Notification*` procedures (which
 * were never implemented on the Hub and 404).
 */

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  getUnreadCount,
  listNotifications,
  acknowledgeNotification,
  acknowledgeAllNotifications,
} = await import('@/lib/trpc')

beforeEach(() => {
  vi.clearAllMocks()
})

function firstUrl(): string {
  return mockFetch.mock.calls[0]![0] as string
}

describe('lab notification client → generic notification.* endpoints', () => {
  it('getUnreadCount hits notification.unreadCount and returns the count', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { data: { json: { count: 4 } } } }),
    })

    const count = await getUnreadCount('tok')

    expect(firstUrl()).toContain('notification.unreadCount')
    expect(firstUrl()).not.toContain('lab.getNotificationCount')
    expect(count).toBe(4)
  })

  it('listNotifications hits notification.list and unwraps the notifications array', async () => {
    const items = [{ id: 'n1', type: 'LAB_RESULT_AVAILABLE', payload: {}, status: 'SENT', createdAt: 't', deliveredAt: null, acknowledgedAt: null }]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      // Generic notification.list returns { notifications: [...] }, not a bare array.
      json: async () => ({ result: { data: { json: { notifications: items } } } }),
    })

    const result = await listNotifications('tok')

    expect(firstUrl()).toContain('notification.list')
    expect(firstUrl()).not.toContain('lab.listNotifications')
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('n1')
  })

  it('acknowledgeNotification hits notification.acknowledge with the notificationId', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { data: { json: { success: true } } } }) })

    await acknowledgeNotification('n1', 'tok')

    expect(firstUrl()).toContain('notification.acknowledge')
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string)
    expect(body).toEqual({ json: { notificationId: 'n1' } })
  })

  it('acknowledgeAllNotifications hits notification.acknowledgeAll', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ result: { data: { json: { success: true } } } }) })

    await acknowledgeAllNotifications('tok')

    expect(firstUrl()).toContain('notification.acknowledgeAll')
    expect(firstUrl()).not.toContain('lab.acknowledgeAllNotifications')
  })
})

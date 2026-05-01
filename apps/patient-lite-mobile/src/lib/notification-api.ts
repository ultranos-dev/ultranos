/**
 * Notification API client for Patient Lite Mobile.
 * Story 12.4: Notification Dispatch — Patient Lite Mobile receiver.
 *
 * Polls Hub API for notifications. Offline-tolerant: errors are
 * silently caught and empty results returned.
 */

export interface NotificationItem {
  id: string
  type: string
  payload: {
    testCategory?: string
    labName?: string
    uploadTimestamp?: string
    diagnosticReportId?: string
    message?: string
  }
  status: string
  createdAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
}

function getHubApiUrl(): string {
  // React Native: use env var or default
  return process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

async function trpcQuery<T>(path: string, input?: object, token?: string): Promise<T> {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  if (input) {
    url.searchParams.set('input', JSON.stringify({ json: input }))
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url.toString(), { method: 'GET', headers })
  if (!res.ok) {
    throw new Error(`Hub API error: ${res.status}`)
  }

  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

async function trpcMutation<T>(path: string, input: object, token?: string): Promise<T> {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) {
    throw new Error(`Hub API error: ${res.status}`)
  }

  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

export async function fetchNotifications(token?: string): Promise<{ notifications: NotificationItem[] }> {
  return trpcQuery<{ notifications: NotificationItem[] }>('notification.list', undefined, token)
}

export async function fetchUnreadCount(token?: string): Promise<{ count: number }> {
  return trpcQuery<{ count: number }>('notification.unreadCount', undefined, token)
}

export async function acknowledgeNotification(notificationId: string, token?: string): Promise<{ success: boolean }> {
  return trpcMutation<{ success: boolean }>('notification.acknowledge', { notificationId }, token)
}

/**
 * Notification API client for OPD Lite.
 * Uses raw fetch to Hub API tRPC endpoints (same pattern as trpc.ts).
 * Story 12.4: Notification Dispatch — OPD Lite receiver.
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
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

function getAuthToken(): string | null {
  // Access token stored in memory via auth session store
  // This follows the project convention: JWT in memory only, never localStorage
  if (typeof window === 'undefined') return null
  return (window as unknown as { __ultranos_token?: string }).__ultranos_token ?? null
}

async function trpcQuery<T>(path: string, input?: object): Promise<T> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  if (input) {
    url.searchParams.set('input', JSON.stringify({ json: input }))
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
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

async function trpcMutation<T>(path: string, input: object): Promise<T> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
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

export async function fetchNotifications(): Promise<{ notifications: NotificationItem[] }> {
  return trpcQuery<{ notifications: NotificationItem[] }>('notification.list')
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
  return trpcQuery<{ count: number }>('notification.unreadCount')
}

export async function acknowledgeNotification(notificationId: string): Promise<{ success: boolean }> {
  return trpcMutation<{ success: boolean }>('notification.acknowledge', { notificationId })
}

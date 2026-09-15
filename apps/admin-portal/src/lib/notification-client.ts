/**
 * Admin-Portal notification client.
 * Calls the Hub's notification.* endpoints using the same auth pattern
 * as the rest of @/lib/trpc (in-memory access token via getAccessToken()).
 *
 * NON-PHI only — admin notifications cover operational/governance events
 * (KYC_*, LAB_*, PROVIDER_SUSPENDED, OUTBREAK_*). No patient lookups.
 */
import { getAccessToken } from '@/lib/trpc'

function getHubApiUrl(): string {
  return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

// ── DTO ──────────────────────────────────────────────────────────────────────

/**
 * Non-PHI admin notification descriptor.
 * Descriptor fields let the UI resolve localised text without storing
 * human-readable strings server-side.
 */
export interface AdminNotificationItem {
  id: string
  type: string
  /** Source spoke or system; matches SourceApp union in notification-presentation */
  sourceApp?: string | null
  /** Key within notifications.subject.* message namespace */
  subjectKey?: string | null
  /** Key within notifications.body.* message namespace */
  bodyKey?: string | null
  /** Interpolation params for bodyKey template (non-PHI values only) */
  bodyParams?: Record<string, string | number>
  /** Key within notifications.notes.* message namespace */
  notesKey?: string | null
  /** DELIVERED | ACKNOWLEDGED */
  status: string
  createdAt: string
  deliveredAt: string | null
  acknowledgedAt: string | null
  /**
   * Opaque operational payload — may include status, referenceId, etc.
   * NEVER add patientId, nationalId, name, diagnosis, or any PHI here.
   */
  payload?: {
    status?: string
    referenceId?: string
    acknowledgedAt?: string
    [key: string]: unknown
  }
}

// ── Client functions ─────────────────────────────────────────────────────────

/** List admin notifications (newest first). */
export async function fetchNotifications(): Promise<AdminNotificationItem[]> {
  const token = getAccessToken()
  if (!token) return []

  const res = await fetch(`${getHubApiUrl()}/notification.list`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
  const body = await res.json() as {
    result: { data: { json: { notifications: AdminNotificationItem[] } } }
  }
  return body.result.data.json.notifications
}

/** Unread count for the badge. Best-effort — returns 0 on failure. */
export async function fetchUnreadCount(): Promise<number> {
  try {
    const token = getAccessToken()
    if (!token) return 0

    const res = await fetch(`${getHubApiUrl()}/notification.unreadCount`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 0
    const body = await res.json() as { result: { data: { json: { count: number } } } }
    return body.result.data.json.count
  } catch {
    return 0
  }
}

/** Acknowledge a single notification. Best-effort. */
export async function acknowledgeNotification(notificationId: string): Promise<void> {
  const token = getAccessToken()
  if (!token) return
  await fetch(`${getHubApiUrl()}/notification.acknowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: { notificationId } }),
  })
}

import { getHubApiUrl } from '@/lib/trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/**
 * Best-effort count of PENDING dispense reviews from the Hub
 * (dispenseReview.list). Returns 0 on ANY failure — no token, offline,
 * non-2xx, or a malformed body — and never throws, so the dashboard degrades
 * gracefully rather than erroring. No PHI is stored: only a count is returned.
 */
export async function fetchPendingDispenseReviewCount(): Promise<number> {
  try {
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return 0

    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/dispenseReview.list'
    url.searchParams.set('input', JSON.stringify({ json: { statuses: ['PENDING'] } }))

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 0

    const body = (await res.json()) as { result?: { data?: { json?: unknown } } }
    const rows = body?.result?.data?.json
    return Array.isArray(rows) ? rows.length : 0
  } catch {
    return 0
  }
}

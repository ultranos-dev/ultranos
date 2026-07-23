/**
 * Sync function for the drain worker. Pushes a single SyncQueueEntry
 * to the Hub API at /medication.recordDispense.
 *
 * Returns SyncResult with special handling for:
 * - 401: auth-expired (does NOT count as a retry failure)
 * - 409: conflict with remoteVersion
 * - Success / generic error
 */

import type { SyncQueueEntry, SyncResult } from '@ultranos/sync-engine'
import { createMeterFetch } from '@ultranos/sync-engine'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import { recordDataUsage } from './db'

const meteredFetch = createMeterFetch(
  fetch,
  (entry) => recordDataUsage({ date: entry.date, category: entry.category, bytesOut: entry.bytesOut, bytesIn: entry.bytesIn, requestCount: entry.requestCount }).catch(() => {}),
)

export async function drainSyncFn(entry: SyncQueueEntry): Promise<SyncResult> {
  const token = await useAuthSessionStore.getState().getAccessToken()
  if (!token) {
    return { success: false, error: 'auth-expired' }
  }

  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/medication.recordDispense'

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(entry.payload)
  } catch {
    return { success: false, error: 'invalid-payload' }
  }

  const res = await meteredFetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ json: parsedPayload }),
  })

  if (res.ok) {
    return { success: true }
  }

  if (res.status === 401) {
    return { success: false, error: 'auth-expired' }
  }

  if (res.status === 409) {
    // Return generic error so entry retries instead of being silently marked synced
    // (no onConflict handler configured — full conflict handling deferred to Story 26.4)
    return { success: false, error: 'Hub rejected with 409 Conflict' }
  }

  if (res.status === 403) {
    // Surface the tRPC gate reason (KYC_REQUIRED / SUBSCRIPTION_REQUIRED /
    // ORG_SUSPENDED) so the pharmacist sees an actionable message instead of a
    // bare status. Falls back to the status when the body isn't the expected shape.
    let reason = `Hub sync failed: 403`
    try {
      const body = await res.json() as { error?: { json?: { message?: string } } }
      if (body?.error?.json?.message) reason = body.error.json.message
    } catch { /* non-JSON body — keep the status */ }
    return { success: false, error: reason }
  }

  return { success: false, error: `Hub sync failed: ${res.status}` }
}

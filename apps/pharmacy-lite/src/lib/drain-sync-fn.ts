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
  const base = url.pathname.replace(/\/$/, '')

  let body: unknown
  if (entry.resourceType === 'MedicationDispense') {
    url.pathname = base + '/medication.recordDispense'
    let parsed: unknown
    try {
      parsed = JSON.parse(entry.payload)
    } catch {
      return { success: false, error: 'invalid-payload' }
    }
    body = { json: parsed }
  } else {
    url.pathname = base + '/sync.push'
    // sync.push input schema is z.object({ operations: [...] }) — the ops array MUST
    // be wrapped in { operations }, matching the OPD-Lite spoke. A bare array is
    // rejected with a 400 Zod validation error.
    body = {
      json: {
        operations: [{
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          action: entry.action === 'delete' ? 'delete' : entry.action === 'update' ? 'update' : 'create',
          payload: entry.payload, // sync.push expects a JSON *string* payload — do NOT parse
          hlcTimestamp: entry.hlcTimestamp,
        }],
      },
    }
  }

  const res = await meteredFetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  if (res.status === 401) {
    return { success: false, error: 'auth-expired' }
  }

  if (res.status === 409) {
    // Genuine HTTP-level 409 (distinct from the application-level conflict path).
    // Application-level conflicts are signalled as 200 { results:[{success:false,conflict:{…}}] }
    // and handled via the response body below. A true HTTP 409 is retryable.
    return { success: false, error: 'Hub rejected with 409 Conflict' }
  }

  if (res.status === 403) {
    // Surface the tRPC gate reason (KYC_REQUIRED / SUBSCRIPTION_REQUIRED /
    // ORG_SUSPENDED) so the pharmacist sees an actionable message instead of a
    // bare status. Falls back to the status when the body isn't the expected shape.
    let reason = `Hub sync failed: 403`
    try {
      const errBody = await res.json() as { error?: { json?: { message?: string } } }
      if (errBody?.error?.json?.message) reason = errBody.error.json.message
    } catch { /* non-JSON body — keep the status */ }
    return { success: false, error: reason }
  }

  if (!res.ok) {
    return { success: false, error: `Hub sync failed: ${res.status}` }
  }

  // Parse success response depending on branch
  if (entry.resourceType !== 'MedicationDispense') {
    const json = await res.json()
    const result = json?.result?.data?.json?.results?.[0]
    if (result?.success) return { success: true }
    // Surface the conflict so the DrainWorker runs the tiered resolveConflict +
    // onConflict observer (the Hub already applied its resolution; the local
    // push is obsolete and the worker will markSynced without retrying).
    if (result?.conflict) return { success: false, conflict: result.conflict }
    return { success: false, error: result?.error ?? 'sync-push-failed' }
  }

  return { success: true }
}

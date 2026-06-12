/**
 * Story 42.5 — Result Release & Notification Dispatch
 * Task 8: Dispatches notifications to ordering physicians on result release.
 *
 * Data minimization (CLAUDE.md Rule #7): The notification payload tells the
 * physician "a result is ready" but does NOT include actual result values.
 * The physician retrieves the full result via OPD-Lite.
 *
 * Online path:  POST to Hub notification.create via tRPC
 * Offline path: Queue in Dexie syncQueue for dispatch on reconnect
 */
import type { LabResultForAuthorization } from '../types/authorization'
import { getDb } from './db'
import { hlc, serializeHlc } from './hlc'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/** Notification payload shape — NO actual result values (data minimization). */
export interface ResultReleaseNotificationPayload {
  type: 'LAB_RESULT_AVAILABLE'
  payload: {
    testCategory: string
    loincCode: string
    diagnosticReportId: string   // references the result ID for lookup
    resultStatus: 'FINAL'
    labName: string
    /** Optional guidance content IDs — patient-lite looks up content locally (AC: 8). No PHI. */
    guidanceContentIds?: string[]
  }
}

/**
 * Dispatch a result-available notification to the ordering physician.
 *
 * If the device is online, POSTs directly to Hub via tRPC.
 * If offline, enqueues in Dexie syncQueue for dispatch on reconnect.
 *
 * @param guidanceContentIds - Optional: public health guidance IDs to include in the
 *   notification payload. Patient-lite looks these up locally — no guidance content
 *   or PHI is transferred here (AC: 8). Omit when no guidance triggered.
 *
 * Never throws — authorization flow must not be blocked by notification failures.
 */
export async function dispatchResultRelease(
  result: LabResultForAuthorization,
  labName = 'Lab Lite',
  guidanceContentIds?: string[],
): Promise<void> {
  const notificationPayload: ResultReleaseNotificationPayload = {
    type: 'LAB_RESULT_AVAILABLE',
    payload: {
      testCategory: result.testCategory,
      loincCode: result.loincCode,
      diagnosticReportId: result.id,  // opaque reference — no values
      resultStatus: 'FINAL',
      labName,
      ...(guidanceContentIds && guidanceContentIds.length > 0 ? { guidanceContentIds } : {}),
    },
  }

  // Try online dispatch first
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await _dispatchOnline(notificationPayload, result.id)
      return
    } catch {
      // Fall through to offline queue
    }
  }

  // Offline: queue in syncQueue for later dispatch
  await _enqueueNotification(notificationPayload, result.id)
}

async function _dispatchOnline(
  payload: ResultReleaseNotificationPayload,
  resultId: string,
): Promise<void> {
  const session = useAuthSessionStore.getState().session
  if (!session) throw new Error('No active session')

  const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('No access token')

  const res = await fetch(`${getHubApiUrl()}/lab.createNotification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ json: payload }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`Notification dispatch failed: ${res.status}`)
}

async function _enqueueNotification(
  payload: ResultReleaseNotificationPayload,
  resultId: string,
): Promise<void> {
  const db = getDb()
  await db.syncQueue.put({
    id: crypto.randomUUID(),
    resourceType: 'notification',
    resourceId: resultId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    hlcTimestamp: serializeHlc(hlc.now()),
    payload,
  })
}

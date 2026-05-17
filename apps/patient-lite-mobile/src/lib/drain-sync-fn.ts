/**
 * Sync function for DrainWorker — dispatches sync queue entries to the Hub API.
 *
 * Routes by resourceType:
 *   - Consent → POST consent.sync
 *   - Patient → POST patient.update
 *   - Others  → POST sync.push
 *
 * Handles 401 auth-expired by returning a non-retryable failure
 * so the drain worker pauses without exhausting retries.
 */
import type { SyncQueueEntry, SyncResult } from '@ultranos/sync-engine'

/** Auth token provider — returns the current OTP session token or null if expired. */
export type GetAuthToken = () => Promise<string | null>

/** Hub base URL provider. */
export type GetHubUrl = () => string

export interface DrainSyncConfig {
  getAuthToken: GetAuthToken
  getHubUrl: GetHubUrl
}

const RESOURCE_ENDPOINT_MAP: Record<string, string> = {
  Consent: '/api/consent.sync',
  Patient: '/api/patient.update',
}

const DEFAULT_ENDPOINT = '/api/sync.push'

/**
 * Create the sync function used by DrainWorker to push entries to the Hub.
 */
export function createDrainSyncFn(
  config: DrainSyncConfig,
): (entry: SyncQueueEntry) => Promise<SyncResult> {
  return async (entry: SyncQueueEntry): Promise<SyncResult> => {
    const token = await config.getAuthToken()
    if (!token) {
      // Auth expired — return failure without incrementing retry count.
      // The drain worker will pick this up again after re-auth.
      return {
        success: false,
        error: 'AUTH_EXPIRED',
        authExpired: true,
      }
    }

    const hubUrl = config.getHubUrl()
    const endpoint = RESOURCE_ENDPOINT_MAP[entry.resourceType] ?? DEFAULT_ENDPOINT
    const url = `${hubUrl}${endpoint}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          action: entry.action,
          payload: typeof entry.payload === 'string' ? JSON.parse(entry.payload) : entry.payload,
          hlcTimestamp: entry.hlcTimestamp,
        }),
      })

      if (response.status === 401) {
        return {
          success: false,
          error: 'AUTH_EXPIRED',
          authExpired: true,
        }
      }

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        return { success: true }
      }

      const body = await response.json()

      // Check for conflict reported by Hub
      if (body.conflict) {
        return {
          success: false,
          conflict: { remoteVersion: body.conflict.remoteVersion },
        }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      }
    }
  }
}

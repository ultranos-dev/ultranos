/**
 * Client-side consent verification for lab results access.
 * Story 20.5, Task 6: Consent enforcement.
 *
 * Checks Hub API for active consent granting clinician access to LABS scope
 * for a specific patient. Results are cached locally for offline support.
 *
 * The Hub API also enforces consent server-side on diagnosticReport endpoints,
 * so this is a defense-in-depth client-side check.
 */

import { getHubTrpcUrl } from '@/lib/hub-url'

export type ConsentCheckResult =
  | { granted: true; unverified?: boolean }
  | { granted: false; reason: 'no_consent' | 'expired' | 'network_error' }

function getHubApiUrl(): string {
  return getHubTrpcUrl()
}


// In-memory cache to avoid repeated consent checks per session
const consentCache = new Map<string, { result: ConsentCheckResult; expiry: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Check whether the current practitioner has consent to view LABS data
 * for a specific patient.
 *
 * Uses Hub API consent.check endpoint if available, otherwise grants
 * access (Hub API enforces consent server-side as fallback).
 */
export async function checkLabsConsent(patientId: string): Promise<ConsentCheckResult> {
  const cacheKey = `labs:${patientId}`
  const cached = consentCache.get(cacheKey)
  if (cached && cached.expiry > Date.now()) {
    return cached.result
  }

  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/consent.check'
    // The Hub's consent.check takes { patientId, resourceType } and returns
    // { permitted }. Labs data is the DiagnosticReport resource — the same
    // resourceType the Hub's lab-data endpoints enforce consent against.
    url.searchParams.set('input', JSON.stringify({
      json: {
        patientId,
        resourceType: 'DiagnosticReport',
      },
    }))

    // Use the canonical Hub auth headers (Supabase access token). Historically
    // this read a nonexistent `token` field off the auth-session store, so it
    // always sent no Authorization header and the Hub returned 401.
    const { getAuthHeaders } = await import('@/lib/hub-auth')
    const headers = await getAuthHeaders()

    const res = await fetch(url.toString(), { method: 'GET', headers })

    if (!res.ok) {
      // If consent endpoint not available (404), allow access —
      // Hub API enforces consent server-side as defense-in-depth
      if (res.status === 404) {
        const result: ConsentCheckResult = { granted: true }
        consentCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS })
        return result
      }
      // 403 = consent denied
      if (res.status === 403) {
        const result: ConsentCheckResult = { granted: false, reason: 'no_consent' }
        consentCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS })
        return result
      }
      throw new Error(`Consent check failed: ${res.status}`)
    }

    // consent.check returns { permitted: boolean }. It does not distinguish
    // "expired" from "never granted", so a denial maps to 'no_consent'.
    const body = await res.json() as { result: { data: { json: { permitted: boolean } } } }
    const permitted = body.result.data.json.permitted

    if (!permitted) {
      const result: ConsentCheckResult = { granted: false, reason: 'no_consent' }
      consentCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS })
      return result
    }

    const result: ConsentCheckResult = { granted: true }
    consentCache.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL_MS })
    return result
  } catch {
    // Offline or network error: if reports exist locally, they were fetched with
    // consent verified server-side. Allow local access as graceful degradation,
    // but flag as unverified so the UI can show a warning banner.
    const result: ConsentCheckResult = { granted: true, unverified: true }
    consentCache.set(cacheKey, { result, expiry: Date.now() + 60_000 }) // short TTL on error
    return result
  }
}

/** Clear consent cache (e.g., on logout) */
export function clearConsentCache(): void {
  consentCache.clear()
}

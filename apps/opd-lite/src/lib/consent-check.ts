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

export type ConsentCheckResult =
  | { granted: true; unverified?: boolean }
  | { granted: false; reason: 'no_consent' | 'expired' | 'network_error' }

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync access to zustand store state
    const { useAuthSessionStore } = require('@/stores/auth-session-store')
    return useAuthSessionStore.getState().session?.token ?? null
  } catch {
    return null
  }
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
    url.pathname = url.pathname.replace(/\/$/, '') + '/consent.checkAccess'
    url.searchParams.set('input', JSON.stringify({
      json: {
        patientRef: `Patient/${patientId}`,
        scope: 'LABS',
      },
    }))

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token = getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

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

    const body = await res.json() as { result: { data: { json: { granted: boolean; expired?: boolean } } } }
    const consent = body.result.data.json

    if (!consent.granted) {
      const reason = consent.expired ? 'expired' as const : 'no_consent' as const
      const result: ConsentCheckResult = { granted: false, reason }
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

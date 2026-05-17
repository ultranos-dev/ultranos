/**
 * Story 24.1: AI Clinical Scribe client service for OPD Lite.
 * Calls Hub API endpoints for AI SOAP parsing and commit.
 * PHI safety: never logs clinical text.
 */

import { useAuthSessionStore } from '@/stores/auth-session-store'

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return useAuthSessionStore.getState().session?.token ?? null
  } catch {
    return null
  }
}

function makeHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

export interface AISOAPResult {
  subjective: string
  objective: string
  assessment: string
  plan: string
  modelVersion: string
}

export interface AISOAPError {
  error: 'AI_UNAVAILABLE' | 'CONSENT_NOT_GRANTED'
  message?: string
  reason?: string
}

export type ParseSOAPResponse = AISOAPResult | AISOAPError

export function isAISOAPError(result: ParseSOAPResponse): result is AISOAPError {
  return 'error' in result
}

/**
 * Call Hub API to parse freeform clinical text into structured SOAP.
 * Returns parsed SOAP sections or error.
 */
export async function parseSOAPWithAI(
  encounterId: string,
  freeformText: string,
): Promise<ParseSOAPResponse> {
  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/encounter.parseSOAPWithAI'

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify({
        json: { encounterId, freeformText },
      }),
    })

    if (!res.ok) {
      return { error: 'AI_UNAVAILABLE', reason: `Hub API returned ${res.status}` }
    }

    const body = await res.json() as { result: { data: { json: ParseSOAPResponse } } }
    return body.result.data.json
  } catch {
    return { error: 'AI_UNAVAILABLE', reason: 'Network error' }
  }
}

/**
 * Commit AI-confirmed SOAP note to the ledger via Hub API.
 * Stores both AI-generated and physician-confirmed versions.
 */
export async function commitAISOAPNote(params: {
  encounterId: string
  originalFreeformText: string
  aiSubjective: string
  aiObjective: string
  aiAssessment: string
  aiPlan: string
  confirmedSubjective: string
  confirmedObjective: string
  confirmedAssessment: string
  confirmedPlan: string
  aiModelVersion: string
  hlcTimestamp: string
}): Promise<{ success: boolean } | { error: string }> {
  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/encounter.commitAISOAPNote'

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: makeHeaders(),
      body: JSON.stringify({ json: params }),
    })

    if (!res.ok) {
      return { error: `Hub API returned ${res.status}` }
    }

    const body = await res.json() as { result: { data: { json: { success: boolean } } } }
    return body.result.data.json
  } catch {
    return { error: 'Network error' }
  }
}

/**
 * Check if patient has AI_PROCESSING consent.
 * Cached per session for performance.
 */
const aiConsentCache = new Map<string, { granted: boolean; expiry: number }>()
const AI_CONSENT_CACHE_TTL = 5 * 60 * 1000

export async function checkAIProcessingConsent(patientId: string): Promise<boolean> {
  const cached = aiConsentCache.get(patientId)
  if (cached && cached.expiry > Date.now()) {
    return cached.granted
  }

  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/consent.check'
    url.searchParams.set('input', JSON.stringify({
      json: { patientId, resourceType: 'AIProcessing' },
    }))

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: makeHeaders(),
    })

    if (!res.ok) {
      // Err on the side of caution: deny if check fails
      aiConsentCache.set(patientId, { granted: false, expiry: Date.now() + 60_000 })
      return false
    }

    const body = await res.json() as { result: { data: { json: { permitted: boolean } } } }
    const granted = body.result.data.json.permitted
    aiConsentCache.set(patientId, { granted, expiry: Date.now() + AI_CONSENT_CACHE_TTL })
    return granted
  } catch {
    // Offline or network error: deny AI processing
    aiConsentCache.set(patientId, { granted: false, expiry: Date.now() + 60_000 })
    return false
  }
}

export function clearAIConsentCache(): void {
  aiConsentCache.clear()
}

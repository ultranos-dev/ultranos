/**
 * Account discovery / claim API client — tRPC-REST bridge.
 *
 * POST mutations send body as {"json": ...}
 * Response shape: { result: { data: { json: T } } }
 *
 * All calls go through hubFetch (certificate-pinned, compromise-aware).
 */
import { hubFetch } from '@/lib/hub-fetch'

function getHubApiUrl(): string {
  return process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

function makeUrl(path: string): string {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  return url.toString()
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function trpcPost<T>(path: string, input: object, token: string): Promise<T> {
  const res = await hubFetch(makeUrl(path), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error ${res.status} on ${path}`)
  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscoverAccountResult {
  matchType: 'none' | 'patient' | 'staff'
  candidate?: {
    ref: string
    maskedName: string
    birthYear: number | null
  }
}

export interface RegisterFromSessionInput {
  firstName: string
  nameFather?: string
  gender?: string
  dateOfBirth: string
  preferredLanguage: string
  addressProvinceCurrent?: string
  addressDistrictCurrent?: string
  addressVillageCurrent?: string
  photoUrl?: string
}

export interface RegisterFromSessionResult {
  patientId?: string
  blocked?: boolean
}

// ---------------------------------------------------------------------------
// Exported API functions
// ---------------------------------------------------------------------------

/** Discover whether the authenticated user's phone matches an existing patient or practitioner record. */
export function discoverAccount(
  token: string,
  input: { phone: string },
): Promise<DiscoverAccountResult> {
  return trpcPost('patientRegistration.discover', input, token)
}

/** Claim an existing patient record, gated by a birth-year factor check. */
export function claimAccount(
  token: string,
  input: { ref: string; phone: string; birthYear: number },
): Promise<{ ok: true }> {
  return trpcPost('patientRegistration.claim', input, token)
}

/** Register a new linked patient record from the current authenticated session. */
export function registerFromSession(
  token: string,
  input: RegisterFromSessionInput,
): Promise<RegisterFromSessionResult> {
  return trpcPost('patientRegistration.registerFromSession', input, token)
}

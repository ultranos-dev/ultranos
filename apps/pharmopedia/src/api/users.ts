/**
 * Users API client — tRPC-REST bridge for users.getProfile.
 *
 * GET queries encode input as ?input={"json":...}
 * Response shape: { result: { data: { json: T } } }
 *
 * All calls go through hubFetch (certificate-pinned, compromise-aware).
 */
import { hubFetch } from '@/lib/hub-fetch'

function getHubApiUrl(): string {
  return process.env.EXPO_PUBLIC_HUB_API_URL ?? 'http://localhost:3004/api/trpc'
}

function makeUrl(path: string, input?: object): string {
  const baseUrl = getHubApiUrl()
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + path
  if (input !== undefined) {
    url.searchParams.set('input', JSON.stringify({ json: input }))
  }
  return url.toString()
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function trpcGet<T>(path: string, input: object | undefined, token: string): Promise<T> {
  const res = await hubFetch(makeUrl(path, input), {
    method: 'GET',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error(`Hub API error ${res.status} on ${path}`)
  const body = await res.json() as { result: { data: { json: T } } }
  return body.result.data.json
}

// ---------------------------------------------------------------------------
// UserProfile discriminated union — consumed by profile-cache, useProfile, and
// the profile screen. Must match the Hub's getProfile return shape exactly.
// ---------------------------------------------------------------------------

export type UserProfile =
  | {
      kind: 'patient'
      displayName: string
      givenName: string
      photoUrl?: string
      phone?: string
      gender?: string
      birthDate?: string
      age?: number
      bloodGroup?: string
      currentAddress?: { province?: string; district?: string; village?: string }
      preferredLanguage?: string
      tier: 'FREE' | 'PREMIUM'
    }
  | {
      kind: 'practitioner'
      displayName: string
      givenName: string
      familyName: string
      role: string
      email?: string
      phone?: string
      organization?: string
      facility?: string
      qualificationDisplay?: string
      licenseId?: string
      licenseExpiry?: string
      status: string
    }

/**
 * Fetch the caller's own profile from the Hub.
 * Input-less query — no ?input= appended (matches makeUrl's undefined branch).
 */
export function getProfile(token: string): Promise<UserProfile> {
  return trpcGet('users.getProfile', undefined as unknown as object, token)
}

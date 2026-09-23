import { getHubTrpcUrl } from '@/lib/hub-url'

/**
 * Shared Hub tRPC HTTP helpers.
 *
 * Every Hub procedure except the handful of public ones is a `protectedProcedure`
 * that returns 401 UNAUTHORIZED when no valid bearer token is present. Historically
 * each caller re-implemented its own `getAuthHeaders()`; one copy (the patient
 * profile-photo update) was missing entirely, so that write silently 401'd and
 * never reached the Hub. This module is the single source of truth so a caller
 * can't forget the token.
 */

/** Hub tRPC endpoint base (`<origin>/api/trpc`). */
export function getHubApiUrl(): string {
  return getHubTrpcUrl()
}

/**
 * Build fetch headers for a Hub tRPC call, attaching the current Supabase access
 * token as a Bearer credential.
 *
 * - SSR-safe: on the server there is no browser session, so it returns bare
 *   `Content-Type` (the caller runs client-side).
 * - Resilient: if the Supabase client or session is unavailable it returns
 *   without an `Authorization` header rather than throwing — the Hub then rejects
 *   with 401, which callers should surface (never treat as success).
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window === 'undefined') return headers
  try {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    const token = data.session?.access_token
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  } catch {
    // Auth unavailable — proceed tokenless; the Hub will reject if required.
  }
  return headers
}

/**
 * Error thrown when the Hub RESPONDED with a non-2xx status (after the single
 * 401 refresh-and-retry cycle in {@link hubTrpcRequest}).
 *
 * DISTINCT FROM OFFLINE by construction: a network-level failure (offline, DNS,
 * abort) makes `fetch` itself reject, and hubTrpcRequest propagates that original
 * error untouched — it is never converted into a HubRequestError. So callers can
 * discriminate: `err instanceof HubRequestError` → the Hub was reachable and
 * refused (auth/authorization/server error); anything else → connectivity.
 * This replaces the old `!res.ok → null/[]` pattern where token expiry
 * masqueraded as "offline".
 */
export class HubRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HubRequestError'
    this.status = status
  }
}

/**
 * Force a single Supabase session refresh. Returns true only when a new access
 * token was actually obtained. Never throws.
 */
async function refreshSupabaseSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data, error } = await getSupabaseBrowserClient().auth.refreshSession()
    return !error && Boolean(data.session?.access_token)
  } catch {
    return false
  }
}

export interface HubTrpcRequestOptions {
  method?: 'GET' | 'POST'
  /** tRPC input — wrapped in the `{ json: ... }` envelope automatically. */
  input?: unknown
  signal?: AbortSignal
}

/**
 * Single shared Hub tRPC request helper (Story 59.3, M-OPD-2).
 *
 * Generalizes the one historically-correct call path
 * (`listEncountersByPractitionerFromHub`) for every Hub call:
 *  - headers always come from {@link getAuthHeaders} (no hand-rolled auth blocks),
 *  - 401 → ONE forced token refresh → ONE retry,
 *  - still failing → throws {@link HubRequestError} carrying the Hub's tRPC error
 *    message (e.g. KYC_REQUIRED) + HTTP status,
 *  - network-level failures (offline/abort) propagate as the original fetch
 *    rejection, keeping "Hub refused" distinct from "Hub unreachable".
 *
 * Returns the unwrapped `result.data.json` payload.
 */
export async function hubTrpcRequest<T>(
  procedure: string,
  options: HubTrpcRequestOptions = {},
): Promise<T> {
  const method = options.method ?? 'GET'
  const url = new URL(`${getHubApiUrl().replace(/\/$/, '')}/${procedure}`)
  if (method === 'GET' && options.input !== undefined) {
    url.searchParams.set('input', JSON.stringify({ json: options.input }))
  }

  const doFetch = async (): Promise<Response> => {
    const headers = await getAuthHeaders()
    return fetch(url.toString(), {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify({ json: options.input }) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    })
  }

  let res = await doFetch()

  if (res.status === 401) {
    // Expired/missing token — one refresh, one retry. If the refresh yields no
    // token there is no point retrying with the same credentials.
    const refreshed = await refreshSupabaseSession()
    if (refreshed) {
      res = await doFetch()
    }
  }

  if (!res.ok) {
    // Surface the tRPC error message (e.g. KYC_REQUIRED, SUBSCRIPTION_REQUIRED)
    // so callers can show WHY the call failed instead of a bare status.
    let reason = `HTTP ${res.status}`
    try {
      const errBody = (await res.json()) as { error?: { json?: { message?: string } } }
      if (errBody?.error?.json?.message) reason = `${errBody.error.json.message} (HTTP ${res.status})`
    } catch {
      /* non-JSON body — keep the status */
    }
    throw new HubRequestError(reason, res.status)
  }

  const body = (await res.json()) as { result?: { data?: { json?: T } } }
  return body?.result?.data?.json as T
}

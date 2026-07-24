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

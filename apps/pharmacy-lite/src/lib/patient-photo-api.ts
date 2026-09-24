import { getHubApiUrl } from '@/lib/trpc'
import { getSupabaseBrowserClient } from '@/lib/supabase'

/** Hub origin base (drops the trailing /api/trpc so we can hit /api/patient-photo). */
function photoEndpoint(): string {
  return getHubApiUrl().replace(/\/api\/trpc\/?$/, '') + '/api/patient-photo'
}

/**
 * Fetch a short-lived signed URL for a patient's photo by patient id (Rule #7
 * revised 2026-09-24: the Hub resolves the opaque storage key server-side and returns
 * a signed URL — the client never holds the raw key). Returns null when the patient
 * has no photo or on any failure (caller shows initials). Pharmacy holds the real
 * patient UUID locally, so it can query by id like opd-lite.
 */
export async function getPatientPhotoUrl(
  patientId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    const token = data.session?.access_token
    if (!token) return null
    const res = await fetch(`${photoEndpoint()}?patientId=${encodeURIComponent(patientId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { signedUrl?: string | null }
    return json.signedUrl ?? null
  } catch {
    return null
  }
}

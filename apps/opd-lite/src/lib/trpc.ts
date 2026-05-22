import type { FhirPatient } from '@ultranos/shared-types'

export interface PatientSearchResult {
  patients: FhirPatient[]
}

function getHubApiUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
  }
  return process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'
}

type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_VERIFY_SUCCESS'
  | 'MFA_VERIFY_FAILURE'

/**
 * Fire-and-forget audit event reporting to Hub API.
 * Never throws — auth flow must not be blocked by audit failures.
 */
export async function reportAuthEvent(
  event: AuthEventType,
  opts?: { actorId?: string; actorEmail?: string },
): Promise<void> {
  try {
    await fetch(`${getHubApiUrl()}/lab.reportAuthEvent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        json: {
          event,
          ...(opts?.actorId ? { actorId: opts.actorId } : {}),
          ...(opts?.actorEmail ? { actorEmail: opts.actorEmail } : {}),
        },
      }),
    })
  } catch {
    // Audit reporting is best-effort from the client.
  }
}

/** Push locally modified appointments to Hub API */
export async function syncAppointmentBatch(
  appointments: Array<Record<string, unknown>>
): Promise<{ synced: number; conflicts: Array<{ id: string; reason: string }> }> {
  const hubUrl = getHubApiUrl()
  try {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
    if (!session?.access_token) return { synced: 0, conflicts: [] }

    const res = await fetch(`${hubUrl}/appointment.syncBatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ json: { appointments } }),
    })

    if (!res.ok) return { synced: 0, conflicts: [] }
    const json = await res.json()
    return json?.result?.data?.json ?? { synced: 0, conflicts: [] }
  } catch {
    return { synced: 0, conflicts: [] }
  }
}

/** Pull practitioner's appointments for a date range from Hub API */
export async function fetchPractitionerAppointments(
  practitionerId: string,
  startDate: string,
  endDate: string,
): Promise<Array<Record<string, unknown>>> {
  const hubUrl = getHubApiUrl()
  try {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
    if (!session?.access_token) return []

    const input = encodeURIComponent(JSON.stringify({ json: { practitionerId, startDate, endDate } }))
    const res = await fetch(`${hubUrl}/appointment.listByPractitioner?input=${input}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    })

    if (!res.ok) return []
    const json = await res.json()
    return json?.result?.data?.json?.appointments ?? []
  } catch {
    return []
  }
}

/**
 * Type-safe wrapper for Hub API patient search.
 * Matches hub-api's patientRouter.search procedure signature.
 *
 * We avoid importing the AppRouter type from hub-api directly because
 * that would pull hub-api's Supabase runtime deps into the PWA build.
 * Instead, we make a raw fetch call to the tRPC endpoint.
 */
export async function searchPatientsOnHub(query: string, signal?: AbortSignal): Promise<PatientSearchResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.search'
  url.searchParams.set('input', JSON.stringify({ json: { query } }))

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    const token = data.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers,
    signal,
  })

  if (!res.ok) {
    throw new Error(`Hub API error: ${res.status}`)
  }

  const body = await res.json() as { result: { data: { json: PatientSearchResult } } }
  return body.result.data.json
}

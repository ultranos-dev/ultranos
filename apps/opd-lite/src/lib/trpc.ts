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

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal,
  })

  if (!res.ok) {
    throw new Error(`Hub API error: ${res.status}`)
  }

  const body = await res.json() as { result: { data: { json: PatientSearchResult } } }
  return body.result.data.json
}

import { db, type LocalPatient } from '@/lib/db'

const SEARCH_LIMIT = 20

/**
 * Phase 1: Local Dexie search — fast, works offline.
 * Searches nameGiven (case-insensitive prefix) and phone (exact prefix).
 */
export async function searchPatientsLocal(query: string): Promise<LocalPatient[]> {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed || trimmed.length < 2) return []

  const results = await db.patients
    .filter((p) => {
      const nameMatch = p.nameGiven.toLowerCase().startsWith(trimmed)
      const phoneMatch = p.phone?.startsWith(trimmed) ?? false
      return nameMatch || phoneMatch
    })
    .limit(SEARCH_LIMIT)
    .toArray()

  return results
}

/**
 * Phase 2: Hub API search — non-blocking background revalidation.
 * Only called when online. Returns additional matches not in local DB.
 */
export async function searchPatientsHub(
  query: string,
  hubBaseUrl: string,
  token: string,
  signal?: AbortSignal,
): Promise<LocalPatient[]> {
  const url = new URL(hubBaseUrl)
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.search'
  url.searchParams.set('input', JSON.stringify({ json: { query, limit: SEARCH_LIMIT } }))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  })

  if (!res.ok) return []

  const body = (await res.json()) as { result: { data: { json: LocalPatient[] } } }
  return body.result.data.json
}

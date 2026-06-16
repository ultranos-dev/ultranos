import { db, type LocalPatient } from '@/lib/db'
import { encryptionKeyStore } from '@/lib/encryption-key-store'

const SEARCH_LIMIT = 20

export const SESSION_REQUIRED_ERROR = 'Session required for patient search'

/**
 * Phase 1: Local in-memory decrypt-and-filter search — fast, works offline.
 *
 * Story 28.6: nameGiven and phone are no longer indexed cleartext fields.
 * The middleware's filter() proxy decrypts all records, then we apply the
 * predicate in JS against the decrypted values.
 *
 * Returns an empty array if the encryption key is not available.
 * The caller is responsible for surfacing the error via SESSION_REQUIRED_ERROR.
 */
export async function searchPatientsLocal(query: string): Promise<LocalPatient[]> {
  if (!encryptionKeyStore.isReady()) return []

  const trimmed = query.trim().toLowerCase()
  if (!trimmed || trimmed.length < 2) return []

  // toArray() decrypts all records via middleware; filter runs in JS.
  // limit() is NOT chained before toArray() — applying limit() to a filter() chain
  // truncates the IDB cursor before decryption, causing matches beyond position N
  // to be silently excluded. Instead, slice after filtering.
  const all = await db.patients.toArray()

  const results = all
    .filter((p) => {
      const nameMatch = (p.nameGiven ?? '').toLowerCase().startsWith(trimmed)
      const phoneMatch = (p.phone ?? '').startsWith(trimmed)
      return nameMatch || phoneMatch
    })
    .slice(0, SEARCH_LIMIT)

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

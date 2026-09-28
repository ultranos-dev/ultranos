/**
 * OPD-Lite patient Hub network layer — the transport slice of the patient data adapter
 * (Phase 1 / 2d). Extracted verbatim from PatientRegistrationForm so the form's data
 * access sits behind a named, swappable module (pharmacy/lab have different transports).
 * All identifying PHI rides in POST bodies, never URLs (Rule #7 / audit H-LAB-5).
 */
import { getHubApiUrl, getAuthHeaders } from '@/lib/hub-auth'

export interface CheckDuplicatesResult {
  decision: 'ALLOW' | 'WARN' | 'BLOCK'
  candidates: Array<{
    id: string
    nameGiven?: string
    nameFather?: string
    birthYear?: number
    gender?: string
    districtOrigin?: string
    mpiScore: number
    scoreBreakdown: Record<string, number>
  }>
  proceedToken?: string
}

export interface CreatePatientResult {
  id: string
}

export interface UpdatePatientResult {
  id: string
  meta?: { lastUpdated?: string }
}

async function postJson<T>(procedure: string, input: Record<string, unknown>): Promise<T> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/' + procedure
  const headers = await getAuthHeaders()
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: input }),
  })
  if (!res.ok) throw new Error(`Hub API error: ${res.status}`)
  const body = (await res.json()) as { result: { data: { json: T } } }
  return body.result.data.json
}

export async function checkDuplicates(input: Record<string, unknown>): Promise<CheckDuplicatesResult> {
  // POST, not GET: patient.checkDuplicates is a tRPC mutation so the identifying
  // PHI in `input` (National ID, name, phone) rides in the request body — never
  // the URL/query string, where it would land in logs and browser history.
  return postJson<CheckDuplicatesResult>('patient.checkDuplicates', input)
}

export async function createPatient(input: Record<string, unknown>): Promise<CreatePatientResult> {
  return postJson<CreatePatientResult>('patient.create', input)
}

export async function updatePatient(input: Record<string, unknown>): Promise<UpdatePatientResult> {
  return postJson<UpdatePatientResult>('patient.update', input)
}

/** Clinician point-of-care consent capture (append-only). Edit mode only. */
export async function recordConsentPoc(input: Record<string, unknown>): Promise<void> {
  await postJson<unknown>('consent.recordAtPointOfCare', input)
}

/**
 * True when the failure is a connectivity failure (the Hub was unreachable), not an
 * application-level rejection. `fetch` rejects with a TypeError on network failure; a
 * reachable Hub returning 4xx/5xx throws our own `Error("Hub API error: <status>")` —
 * that is NOT a network error and must be surfaced (e.g. a BLOCK PRECONDITION_FAILED).
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err instanceof Error) return /Hub API error/.test(err.message) === false && /fetch|network/i.test(err.message)
  return false
}

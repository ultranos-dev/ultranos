import type { DrugSearchResult, FhirPatient } from '@ultranos/shared-types'
import { getHubTrpcUrl } from '@/lib/hub-url'
import { db, type LocalDiagnosticReport } from '@/lib/db'

export interface PatientSearchResult {
  patients: FhirPatient[]
}

function getHubApiUrl(): string {
  return getHubTrpcUrl()
}

type AuthEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'MFA_VERIFY_SUCCESS'
  | 'MFA_VERIFY_FAILURE'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_COMPLETED'

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
export interface PatientListResult {
  patients: FhirPatient[]
  nextCursor: string | null
}

/**
 * Fetch a page of all active patients from the Hub API.
 * Used for bulk directory sync — no search query required.
 */
export async function listPatientsFromHub(
  cursor?: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<PatientListResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/patient.list'
  const input: Record<string, unknown> = { limit }
  if (cursor) input.cursor = cursor
  url.searchParams.set('input', JSON.stringify({ json: input }))

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

  const body = await res.json() as { result: { data: { json: PatientListResult } } }
  return body.result.data.json
}

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

export interface EncounterListResult {
  /** Flat camelCase encounter rows (transform via toFhirEncounter before local write). */
  encounters: Array<Record<string, unknown>>
  /** Keyset cursor for the next page, or null when the last page has been reached. */
  nextCursor: string | null
}

/**
 * Fetch one page of the authenticated practitioner's active-status encounters
 * (planned/in-progress/finished, across all their patients) from the Hub API.
 * Cursor-paginated — callers loop until nextCursor is null to fetch every one.
 * The token is passed in (rather than re-fetched) so callers can reuse the
 * already-refreshed session token from the sync worker.
 */
export async function listEncountersByPractitionerFromHub(
  token: string,
  cursor?: string,
  limit = 100,
  signal?: AbortSignal,
): Promise<EncounterListResult> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/encounter.listByPractitioner'
  const input: Record<string, unknown> = { limit }
  if (cursor) input.cursor = cursor
  url.searchParams.set('input', JSON.stringify({ json: input }))

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  })

  if (!res.ok) {
    // Surface the tRPC error message (e.g. KYC_REQUIRED, SUBSCRIPTION_REQUIRED)
    // so callers can show WHY encounters are unavailable instead of a bare status.
    let reason = `HTTP ${res.status}`
    try {
      const errBody = await res.json() as { error?: { json?: { message?: string } } }
      if (errBody?.error?.json?.message) reason = `${errBody.error.json.message} (HTTP ${res.status})`
    } catch { /* non-JSON body — keep the status */ }
    throw new Error(reason)
  }

  const body = await res.json() as { result: { data: { json: EncounterListResult } } }
  return body.result.data.json
}

export type EnrichDrugFields = {
  localNames?: Record<string, string>
  dispensingNotes?: string
  formularyStatus?: 'on_formulary' | 'off_formulary' | 'restricted'
  unitCost?: number
}

/**
 * Search the Hub drug catalog by INN name, ATC code, brand name, or local name.
 * Returns identity fields only (no tier content).
 */
export async function searchDrugCatalog(
  q: string,
  lang: 'en' | 'prs' | 'ps' = 'en',
  signal?: AbortSignal,
): Promise<DrugSearchResult[]> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/drugCatalog.search'
  url.searchParams.set('input', JSON.stringify({ json: { q, lang, limit: 20 } }))

  const headers: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  }

  const res = await fetch(url.toString(), { method: 'GET', headers, signal })
  if (!res.ok) throw new Error(`Drug catalog search failed: ${res.status}`)
  const body = await res.json() as { result: { data: { json: DrugSearchResult[] } } }
  return body.result.data.json
}

/**
 * Write local-name enrichment to the Hub drug catalog.
 * Clinician tier: localNames only. Pharmacist tier: all fields.
 * No-op (silent return) when session is missing. Throws on network failure
 * so the caller can display an error message.
 */
export async function enrichDrug(
  atcCode: string,
  fields: EnrichDrugFields,
): Promise<void> {
  if (typeof window === 'undefined') return
  const { getSupabaseBrowserClient } = await import('@/lib/supabase')
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
  if (!session?.access_token) return

  const res = await fetch(`${getHubApiUrl()}/drugCatalog.enrich`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ json: { atcCode, fields } }),
  })
  if (!res.ok) throw new Error(`Drug enrichment failed: ${res.status}`)
}

// ---------------------------------------------------------------------------
// Diagnostic reports (lab results) — Hub -> FHIR R4 -> local Dexie cache.
// ---------------------------------------------------------------------------

/** Flat lab-report row as returned by the Hub `lab.listReportsForPatient` procedure. */
export interface HubDiagnosticReportItem {
  id: string
  resourceType: 'DiagnosticReport'
  status: string
  loincCode: string | null
  loincDisplay: string | null
  patientRef: string
  performerId: string | null
  performerDisplay: string | null
  labId: string | null
  issued: string | null
  collectionDate: string | null
  virusScanStatus: string
  createdAt: string | null
  conclusion: string | null
  presentedForm:
    | Array<{ contentType?: string; data?: string; title?: string; url?: string }>
    | null
}

/** Mapped local report — FHIR R4 DiagnosticReport plus the Ultranos extension block. */
export type MappedDiagnosticReport = LocalDiagnosticReport & {
  meta: { versionId: string; lastUpdated: string }
  _ultranos: {
    createdAt: string
    hlcTimestamp: string
    isOfflineCreated: boolean
    virusScanStatus: 'pending' | 'clean' | 'infected' | 'error'
    labId: string | null
  }
}

const VALID_VIRUS_SCAN = new Set(['pending', 'clean', 'infected', 'error'])

/**
 * Map a flat Hub lab-report row to a FHIR R4 DiagnosticReport for local storage.
 * Pure and deterministic — uses ONLY server-provided timestamps (never new Date())
 * so cached values stay stable, and coerces an unknown virusScanStatus to 'pending'
 * (fail-safe: never trust an unvalidated scan status).
 */
export function mapHubReportToFhir(item: HubDiagnosticReportItem): MappedDiagnosticReport {
  const createdAt = item.createdAt ?? ''
  const virusScanStatus = (VALID_VIRUS_SCAN.has(item.virusScanStatus)
    ? item.virusScanStatus
    : 'pending') as 'pending' | 'clean' | 'infected' | 'error'

  return {
    id: item.id,
    resourceType: 'DiagnosticReport',
    status: item.status,
    code: {
      coding: item.loincCode
        ? [{ system: 'http://loinc.org', code: item.loincCode, display: item.loincDisplay ?? undefined }]
        : [],
    },
    subject: { reference: item.patientRef },
    ...(item.collectionDate ? { effectiveDateTime: item.collectionDate } : {}),
    issued: item.issued ?? '',
    ...(item.conclusion ? { conclusion: item.conclusion } : {}),
    ...(item.performerId
      ? { performer: [{ reference: item.performerId, display: item.performerDisplay ?? undefined }] }
      : {}),
    ...(item.presentedForm ? { presentedForm: item.presentedForm } : {}),
    meta: { versionId: '1', lastUpdated: createdAt },
    _ultranos: { createdAt, hlcTimestamp: '', isOfflineCreated: false, virusScanStatus, labId: item.labId },
  }
}

/** In-flight fetches keyed by patientId — dedupes concurrent calls. */
const inFlightReportFetches = new Map<string, Promise<void>>()

/**
 * Fetch a patient's lab reports from the Hub and upsert them into the local
 * Dexie cache. Offline-first: on any network/parse failure the existing cache
 * is left intact (never cleared). Concurrent calls for the same patient share a
 * single request.
 *
 * NOTE: the Hub-side `lab.listReportsForPatient` procedure is the counterpart
 * this client expects; it must be implemented on hub-api for end-to-end sync.
 */
export async function fetchDiagnosticReportsForPatient(patientId: string): Promise<void> {
  const existing = inFlightReportFetches.get(patientId)
  if (existing) return existing

  const task = (async () => {
    try {
      const { useAuthSessionStore } = await import('@/stores/auth-session-store')
      const token = useAuthSessionStore.getState().session?.token
      const input = encodeURIComponent(JSON.stringify({ json: { patientId } }))
      const res = await fetch(`${getHubApiUrl()}/lab.listReportsForPatient?input=${input}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) return
      const body = (await res.json()) as {
        result?: { data?: { json?: { reports?: HubDiagnosticReportItem[] } } }
      }
      const reports = body?.result?.data?.json?.reports ?? []
      if (reports.length === 0) return
      await db.diagnosticReports.bulkPut(reports.map(mapHubReportToFhir) as never)
    } catch {
      // Network/parse failure — keep the existing Dexie cache (offline-first).
    }
  })()

  inFlightReportFetches.set(patientId, task)
  try {
    await task
  } finally {
    inFlightReportFetches.delete(patientId)
  }
}

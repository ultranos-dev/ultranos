import type { DrugSearchResult, FhirPatient, FhirAllergyIntolerance, PharmacyDirectoryEntry, LabDirectoryEntry, LabOrderStatus } from '@ultranos/shared-types'
import { getHubTrpcUrl, getHubBaseUrl } from '@/lib/hub-url'
import { db, type LocalDiagnosticReport } from '@/lib/db'
import { toFhirAllergyIntolerance } from '@/lib/sync-pull'

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
 * Fetch a patient's ACTIVE allergies authoritatively from the Hub (allergy.list),
 * reshaped from the Hub's flat row into nested FHIR (via toFhirAllergyIntolerance).
 *
 * Returns `null` when the Hub cannot be reached / there is no auth session — the
 * caller then falls back to the local cache (offline-first). An empty array is a
 * definitive "the Hub knows of no active allergies for this patient" (≠ null).
 * Allergies are Tier-1 safety-critical, so their display must not depend solely on
 * best-effort background sync (which can lag or be blocked by a stale watermark).
 */
export async function fetchPatientAllergiesFromHub(
  patientId: string,
): Promise<FhirAllergyIntolerance[] | null> {
  const hubUrl = getHubApiUrl()
  try {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
    if (!session?.access_token) return null

    const input = encodeURIComponent(JSON.stringify({ json: { patientId } }))
    const res = await fetch(`${hubUrl}/allergy.list?input=${input}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return null

    const json = await res.json()
    const rows = json?.result?.data?.json?.allergies
    if (!Array.isArray(rows)) return null
    return rows.map(
      (r) => toFhirAllergyIntolerance(r as Record<string, unknown>) as unknown as FhirAllergyIntolerance,
    )
  } catch {
    return null
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

/**
 * Flat lab-report row as returned by the Hub `diagnosticReport.listByPatient`
 * procedure. The list projection is data-minimized: `performerDisplay`,
 * `conclusion`, and `presentedForm` (PHI / file content) are only returned by
 * `diagnosticReport.read` for a single report, so they are optional here.
 */
export interface HubDiagnosticReportItem {
  id: string
  resourceType: 'DiagnosticReport'
  status: string
  loincCode: string | null
  loincDisplay: string | null
  patientRef: string
  performerId: string | null
  performerDisplay?: string | null
  labId: string | null
  issued: string | null
  collectionDate: string | null
  virusScanStatus: string
  createdAt: string | null
  conclusion?: string | null
  presentedForm?:
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
 * Calls `diagnosticReport.listByPatient` with the REAL `Patient/<id>` reference:
 * consent enforcement resolves on the real id, and the Hub blind-indexes it
 * server-side to match the data-minimized `patient_ref` stored on lab reports.
 */
export async function fetchDiagnosticReportsForPatient(patientId: string): Promise<void> {
  const existing = inFlightReportFetches.get(patientId)
  if (existing) return existing

  const task = (async () => {
    try {
      // Auth token comes from the Supabase session (matches patient.list/search
      // above) — the auth-session store holds no access token.
      const headers: Record<string, string> = {}
      if (typeof window !== 'undefined') {
        const { getSupabaseBrowserClient } = await import('@/lib/supabase')
        const { data } = await getSupabaseBrowserClient().auth.getSession()
        const token = data.session?.access_token
        if (token) headers['Authorization'] = `Bearer ${token}`
      }
      const input = encodeURIComponent(JSON.stringify({ json: { patientRef: `Patient/${patientId}` } }))
      const res = await fetch(`${getHubApiUrl()}/diagnosticReport.listByPatient?input=${input}`, {
        method: 'GET',
        headers,
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

/** Hub file descriptor returned by diagnosticReport.read */
interface HubLabFile {
  id: string
  fileName: string
  fileType: string
  fileSize: number
  downloadUrl: string
}

/**
 * Fetch a single report's detail (incl. structured analytes and attachment photos)
 * via diagnosticReport.read, then fetch each file's bytes (Bearer-authed) and
 * cache everything in the local Dexie store.
 * Offline-first: on any failure the existing cache is left intact.
 * File-level failures (403 virus-scan hold, 404) are skipped gracefully.
 */
export async function fetchDiagnosticReportDetail(reportId: string, patientId: string): Promise<void> {
  try {
    const headers: Record<string, string> = {}
    let token: string | undefined
    if (typeof window !== 'undefined') {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      token = data.session?.access_token ?? undefined
      if (token) headers['Authorization'] = `Bearer ${token}`
    }
    const input = encodeURIComponent(JSON.stringify({ json: { id: reportId, patientRef: `Patient/${patientId}` } }))
    const res = await fetch(`${getHubApiUrl()}/diagnosticReport.read?input=${input}`, { method: 'GET', headers })
    if (!res.ok) return
    const body = (await res.json()) as {
      result?: {
        data?: {
          json?: {
            observations?: Array<Record<string, unknown>>
            files?: HubLabFile[]
          }
        }
      }
    }
    const observations = body?.result?.data?.json?.observations ?? []
    const rows = observations.map((o) => ({
      id: o.id as string,
      diagnosticReportId: reportId,
      loincCode: o.loincCode as string,
      loincDisplay: (o.loincDisplay as string | null) ?? null,
      valueQuantity: (o.valueQuantity as { value: number; unit?: string } | null) ?? null,
      valueString: (o.valueString as string | null) ?? null,
      interpretation: (o.interpretation as unknown[] | null) ?? null,
      referenceRange: (o.referenceRange as { low?: number; high?: number; text?: string } | null) ?? null,
      note: (o.note as Array<{ text: string }> | null) ?? null,
      effectiveDateTime: (o.effectiveDateTime as string | null) ?? null,
    }))
    if (rows.length > 0) await db.diagnosticReportObservations.bulkPut(rows as never)

    // Fetch attachment photo bytes and cache them in presentedForm.
    // Each file is fetched independently; non-OK responses (e.g. 403 virus-scan
    // hold, 404) are skipped so they never block the others.
    const files: HubLabFile[] = body?.result?.data?.json?.files ?? []
    if (files.length > 0 && token) {
      const hubOrigin = getHubBaseUrl()
      const fileAuthHeaders = { Authorization: `Bearer ${token}` }

      const presentedForm: LocalDiagnosticReport['presentedForm'] = (
        await Promise.all(
          files.map(async (file) => {
            try {
              const fileRes = await fetch(`${hubOrigin}${file.downloadUrl}`, {
                method: 'GET',
                headers: fileAuthHeaders,
              })
              if (!fileRes.ok) return null
              const buffer = await fileRes.arrayBuffer()
              // Convert raw bytes to base64 without using Node-specific Buffer
              const bytes = new Uint8Array(buffer)
              let binary = ''
              for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]!)
              }
              const data = btoa(binary)
              return {
                contentType: file.fileType,
                data,
                title: file.fileName,
              } satisfies NonNullable<LocalDiagnosticReport['presentedForm']>[number]
            } catch {
              // Per-file network/parse failure — skip this attachment (offline-first).
              return null
            }
          }),
        )
      ).filter((entry): entry is NonNullable<typeof entry> => entry !== null)

      // Merge presentedForm into the cached DiagnosticReport record.
      // The list-fetch (fetchDiagnosticReportsForPatient) creates the base record;
      // if it already exists we patch presentedForm onto it. If not yet cached we
      // skip (a subsequent list-fetch + detail call will populate it); creating a
      // stub here would risk overwriting richer fields set by the list mapper.
      //
      // UNION strategy (offline-first): on a partial-failure re-fetch, previously
      // cached entries for files that failed THIS call must be preserved. We keep
      // the freshly-fetched version when a title appears in both sets, and retain
      // prior entries for titles that are absent from this fetch (e.g. file that
      // returned 403/404/network error this time but was successfully cached before).
      const existing = await db.diagnosticReports.get(reportId)
      if (existing) {
        const prior = existing.presentedForm ?? []
        const freshTitles = new Set(presentedForm.map((p) => p.title))
        const merged = [...presentedForm, ...prior.filter((p) => !freshTitles.has(p.title))]
        await db.diagnosticReports.put({ ...existing, presentedForm: merged })
      }
    }
  } catch {
    // Network/parse failure — keep the existing cache (offline-first).
  }
}

/**
 * Search the Hub pharmacy directory by name, address, province, or district.
 * Mirrors the searchDrugCatalog pattern exactly: GET pharmacy.search with
 * { q, limit } in the tRPC input envelope, Supabase auth header, unwrap body.result.data.json.
 */
export async function searchPharmaciesHub(
  q: string,
  signal?: AbortSignal,
): Promise<PharmacyDirectoryEntry[]> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/pharmacy.search'
  url.searchParams.set('input', JSON.stringify({ json: { q, limit: 20 } }))

  const headers: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  }

  const res = await fetch(url.toString(), { method: 'GET', headers, signal })
  if (!res.ok) throw new Error(`Pharmacy search failed: ${res.status}`)
  const body = await res.json() as { result: { data: { json: PharmacyDirectoryEntry[] } } }
  return body.result.data.json
}

/**
 * Search the Hub lab directory by name or accreditation reference.
 * Mirrors the searchPharmaciesHub pattern exactly: GET lab.searchDirectory with
 * { q, limit } in the tRPC input envelope, Supabase auth header, unwrap body.result.data.json.
 */
export async function searchLabsHub(
  q: string,
  signal?: AbortSignal,
): Promise<LabDirectoryEntry[]> {
  const url = new URL(getHubApiUrl())
  url.pathname = url.pathname.replace(/\/$/, '') + '/lab.searchDirectory'
  url.searchParams.set('input', JSON.stringify({ json: { q, limit: 20 } }))

  const headers: Record<string, string> = {}
  if (typeof window !== 'undefined') {
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const { data } = await getSupabaseBrowserClient().auth.getSession()
    if (data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
  }

  const res = await fetch(url.toString(), { method: 'GET', headers, signal })
  if (!res.ok) throw new Error(`Lab directory search failed: ${res.status}`)
  const body = await res.json() as { result: { data: { json: LabDirectoryEntry[] } } }
  return body.result.data.json
}

/**
 * Fetch the patient reference (bare UUID) for a single order from the Hub
 * (serviceRequest.getOrderPatientRef). Used by the notification modal when the
 * order is not present in the local Dexie store.
 *
 * Only returns the ref if the caller is the order's author — the Hub scopes it.
 * Returns null on any failure (no session, network error, non-200) so callers
 * can fail soft.
 */
export async function fetchOrderPatientRef(orderId: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/serviceRequest.getOrderPatientRef'
    url.searchParams.set('input', JSON.stringify({ json: { orderId } }))

    const headers: Record<string, string> = {}
    if (typeof window !== 'undefined') {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`
      }
    }

    const res = await fetch(url.toString(), { method: 'GET', headers, signal })
    if (!res.ok) return null
    const body = (await res.json()) as { result?: { data?: { json?: { patientRef: string | null } } } }
    return body.result?.data?.json?.patientRef ?? null
  } catch {
    return null
  }
}

/**
 * Fetch the current processing status of the caller's lab orders from the Hub
 * (serviceRequest.getOrderStatus). Returns operational status only — used to lock
 * rows once a lab has started an order. Offline-first: returns [] on any failure
 * (no auth session, network error, non-200) so the UI falls back to last-known
 * local status and never blocks. Empty input short-circuits without a request.
 */
export async function fetchLabOrderStatuses(ids: string[]): Promise<LabOrderStatus[]> {
  if (!ids.length) return []
  try {
    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/serviceRequest.getOrderStatus'
    url.searchParams.set('input', JSON.stringify({ json: { ids } }))

    const headers: Record<string, string> = {}
    if (typeof window !== 'undefined') {
      const { getSupabaseBrowserClient } = await import('@/lib/supabase')
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`
      }
    }

    const res = await fetch(url.toString(), { method: 'GET', headers })
    if (!res.ok) return []
    const body = (await res.json()) as { result?: { data?: { json?: LabOrderStatus[] } } }
    return body.result?.data?.json ?? []
  } catch {
    return []
  }
}

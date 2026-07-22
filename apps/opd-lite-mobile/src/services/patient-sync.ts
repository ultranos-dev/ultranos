/**
 * Background sync service — fetches all active patients from Hub API.
 * Uses tRPC raw fetch pattern (avoids cross-app build dependency).
 * Merge strategy: LWW for Tier 3 (demographics), append-only for Tier 1 (allergies, active meds).
 *
 * Contract note: the Hub's `patient.list` procedure accepts `{ cursor?, limit? }`
 * (cursor is the previous page's `created_at`) and returns `{ patients, nextCursor }`,
 * wrapped by the tRPC REST bridge as `result.data.json`. It returns `meta.lastUpdated`
 * as an ISO 8601 instant (from Postgres `updated_at`/`created_at`), NOT a serialized
 * HLC — so Tier-3 recency is compared with Date semantics, never `deserializeHlc`.
 *
 * NOTE: A push/drain path (uploading locally-queued patient edits to the Hub) is not
 * yet implemented — that remains genuine scaffold and is out of scope here.
 */
import { getDatabase } from '../lib/db'
import { hashNationalId } from '../lib/hash-national-id'
import type { FhirPatient } from '@ultranos/shared-types'

const HUB_API_BASE = process.env.EXPO_PUBLIC_HUB_API_BASE ?? 'https://hub.ultranos.com'
const PAGE_LIMIT = 50

interface PatientListPage {
  patients: FhirPatient[]
  nextCursor: string | null
}

interface SyncResult {
  synced: number
  /** Count of records that failed to merge. */
  errors: number
  /**
   * Diagnosable per-record failure details. OPAQUE patient id + error class only —
   * never any PHI content (names, allergies, meds, diagnoses).
   */
  errorDetails: Array<{ id: string; reason: string }>
}

/**
 * Fetch one page of active patients from the Hub API.
 * @param authToken - JWT access token for Hub API
 * @param cursor - opaque pagination cursor from the previous page's `nextCursor`
 */
async function fetchPatientPage(
  authToken: string,
  cursor?: string
): Promise<PatientListPage> {
  const url = new URL('/api/trpc/patient.list', HUB_API_BASE)
  const input: Record<string, unknown> = { limit: PAGE_LIMIT }
  if (cursor) input.cursor = cursor
  // tRPC REST bridge expects the input wrapped in a `json` envelope.
  url.searchParams.set('input', JSON.stringify({ json: input }))

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status}`)
  }

  const body = (await response.json()) as {
    result?: { data?: { json?: PatientListPage } }
  }
  const page = body.result?.data?.json
  return {
    patients: page?.patients ?? [],
    nextCursor: page?.nextCursor ?? null,
  }
}

/**
 * Fetch ALL active patients from the Hub API (paging through every cursor page)
 * and merge them into the local SQLCipher DB.
 *
 * @param _lastSyncTimestamp - reserved for a future incremental/delta pull; the Hub's
 *   `patient.list` currently paginates the full active set via cursor, so this is unused.
 * @param authToken - JWT access token for Hub API
 */
export async function syncPatients(
  _lastSyncTimestamp: string | null,
  authToken: string
): Promise<SyncResult> {
  const db = await getDatabase()
  let synced = 0
  let errors = 0
  const errorDetails: Array<{ id: string; reason: string }> = []

  let cursor: string | undefined
  while (true) {
    // A page-fetch failure (network/auth) is thrown so the caller can react —
    // matches the existing "throw on non-200" contract.
    const { patients, nextCursor } = await fetchPatientPage(authToken, cursor)

    for (const remotePatient of patients) {
      try {
        await mergePatient(db, remotePatient)
        synced++
      } catch (err) {
        errors++
        // OPAQUE id + error class only — never PHI content.
        errorDetails.push({
          id: remotePatient.id ?? 'unknown',
          reason: err instanceof Error ? err.constructor.name : 'UnknownError',
        })
      }
    }

    if (!nextCursor) break
    cursor = nextCursor
  }

  return { synced, errors, errorDetails }
}

/**
 * Compare two ISO 8601 instants for Tier-3 (demographics) LWW.
 * Returns > 0 when `a` is strictly newer than `b`.
 *
 * The Hub returns `meta.lastUpdated` as an ISO instant, not a serialized HLC, so
 * recency is compared with Date semantics. An unparseable timestamp sorts as -Infinity
 * so a valid remote/local value always wins over a garbage one.
 */
function isoRecencyDelta(a: string | undefined, b: string | undefined): number {
  const ta = a ? Date.parse(a) : NaN
  const tb = b ? Date.parse(b) : NaN
  const na = Number.isNaN(ta) ? -Infinity : ta
  const nb = Number.isNaN(tb) ? -Infinity : tb
  return na - nb
}

/**
 * Merge a remote patient into local SQLCipher.
 * - Tier 3 fields (demographics): LWW by ISO meta.lastUpdated (newer wins)
 * - Tier 1 fields (allergies, active meds): append-only merge
 */
async function mergePatient(db: any, remotePatient: FhirPatient): Promise<void> {
  const existing = await db.getFirstAsync<{ fhir_json: string; allergies_json: string; active_meds_json: string }>(
    'SELECT fhir_json, allergies_json, active_meds_json FROM patients WHERE id = ?',
    [remotePatient.id]
  )

  // Extract allergies and active meds from remote patient extensions
  const remoteAllergies: string[] = (remotePatient as any)._allergies ?? []
  const remoteMeds: string[] = (remotePatient as any)._activeMeds ?? []

  // Ensure national ID is hashed before storing (PHI safety — never store raw IDs)
  if (remotePatient._ultranos?.nationalIdHash) {
    const raw = remotePatient._ultranos.nationalIdHash
    // Only hash if it doesn't look like a SHA-256 hash already (64 hex chars)
    if (raw.length !== 64 || !/^[a-f0-9]{64}$/i.test(raw)) {
      remotePatient = {
        ...remotePatient,
        _ultranos: {
          ...remotePatient._ultranos,
          nationalIdHash: await hashNationalId(raw),
        },
      }
    }
  }

  if (!existing) {
    // New patient — insert
    await insertPatient(db, remotePatient, remoteAllergies, remoteMeds)
    return
  }

  const localPatient = JSON.parse(existing.fhir_json) as FhirPatient

  // Compare ISO instants for Tier 3 (demographics) — newer wins.
  // The Hub returns meta.lastUpdated as an ISO 8601 instant, never a serialized HLC.
  const useRemoteDemographics =
    isoRecencyDelta(remotePatient.meta.lastUpdated, localPatient.meta.lastUpdated) > 0

  // Tier 1: append-only merge for allergies and active meds
  const localAllergies: string[] = JSON.parse(existing.allergies_json || '[]')
  const localMeds: string[] = JSON.parse(existing.active_meds_json || '[]')
  const mergedAllergies = mergeAppendOnly(localAllergies, remoteAllergies)
  const mergedMeds = mergeAppendOnly(localMeds, remoteMeds)

  // Build merged patient
  const mergedPatient = useRemoteDemographics ? remotePatient : localPatient
  // Attach merged Tier 1 data
  const enriched = { ...mergedPatient, _allergies: mergedAllergies, _activeMeds: mergedMeds }

  const nationalIdHash = remotePatient._ultranos?.nationalIdHash ?? null

  await db.runAsync(
    `UPDATE patients SET
      name_text = ?, name_local = ?, name_latin = ?, gender = ?,
      birth_date = ?, birth_year_only = ?, national_id_hash = ?,
      patient_tier = ?, preferred_language = ?, is_active = ?,
      meta_last_updated = ?, meta_version_id = ?,
      allergies_json = ?, active_meds_json = ?, fhir_json = ?
    WHERE id = ?`,
    [
      mergedPatient.name?.[0]?.text ?? null,
      mergedPatient._ultranos?.nameLocal ?? '',
      mergedPatient._ultranos?.nameLatin ?? null,
      mergedPatient.gender,
      mergedPatient.birthDate ?? null,
      mergedPatient.birthYearOnly ? 1 : 0,
      nationalIdHash,
      mergedPatient._ultranos?.patient_tier ?? 'FREE',
      mergedPatient._ultranos?.preferredLanguage ?? null,
      mergedPatient._ultranos?.isActive ? 1 : 0,
      mergedPatient.meta.lastUpdated,
      mergedPatient.meta.versionId ?? null,
      JSON.stringify(mergedAllergies),
      JSON.stringify(mergedMeds),
      JSON.stringify(enriched),
      mergedPatient.id,
    ]
  )
}

async function insertPatient(
  db: any,
  patient: FhirPatient,
  allergies: string[],
  activeMeds: string[]
): Promise<void> {
  const enriched = { ...patient, _allergies: allergies, _activeMeds: activeMeds }

  await db.runAsync(
    `INSERT INTO patients (
      id, resource_type, name_text, name_family, name_given, name_local, name_latin,
      name_phonetic, gender, birth_date, birth_year_only, phone,
      national_id_hash, guardian_id, consent_version, patient_tier,
      preferred_language, is_active, created_by, created_at,
      meta_last_updated, meta_version_id, allergies_json, active_meds_json, fhir_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient.id,
      patient.resourceType,
      patient.name?.[0]?.text ?? null,
      patient.name?.[0]?.family ?? null,
      patient.name?.[0]?.given?.join(' ') ?? null,
      patient._ultranos?.nameLocal ?? '',
      patient._ultranos?.nameLatin ?? null,
      patient._ultranos?.namePhonetic ?? null,
      patient.gender,
      patient.birthDate ?? null,
      patient.birthYearOnly ? 1 : 0,
      patient.telecom?.find((t) => t.system === 'phone')?.value ?? null,
      patient._ultranos?.nationalIdHash ?? null,
      patient._ultranos?.guardianId ?? null,
      patient._ultranos?.consentVersion ?? null,
      patient._ultranos?.patient_tier ?? 'FREE',
      patient._ultranos?.preferredLanguage ?? null,
      patient._ultranos?.isActive ? 1 : 0,
      patient._ultranos?.createdBy ?? null,
      patient._ultranos?.createdAt ?? new Date().toISOString(),
      patient.meta.lastUpdated,
      patient.meta.versionId ?? null,
      JSON.stringify(allergies),
      JSON.stringify(activeMeds),
      JSON.stringify(enriched),
    ]
  )
}

/**
 * Append-only merge: union of two arrays, preserving both.
 * Tier 1 fields (allergies, active meds) — never lose data.
 * Uses case-insensitive deduplication to avoid "Penicillin" vs "penicillin" duplicates.
 * When duplicates differ only in case, the first occurrence (local) is kept.
 */
export function mergeAppendOnly(local: string[], remote: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of [...local, ...remote]) {
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(item)
    }
  }
  return result
}

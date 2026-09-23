import { db, type LocalPatient } from './db'
import { getHubApiUrl } from './trpc'
import { auditPhiAccess, AuditAction, AuditResourceType } from './audit'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/**
 * Story 57.1 — dispense-time patient resolution (C-SYS-3 remediation).
 *
 * Resolves the patient behind a scanned prescription's `pat` reference so the
 * dispense-time allergy gate runs against the patient's REAL allergy record:
 *
 *   1. Local `db.patients` registry lookup (offline-first).
 *   2. Hub `allergy.listForDispense` fetch when online (consent-gated,
 *      PHARMACIST-scoped, audited server-side) — this is what surfaces
 *      OPD-recorded allergies the pharmacy registry never sees.
 *   3. Encrypted Dexie cache (`patientAllergyCache`, keyed by patient ref with
 *      a `fetchedAt` staleness marker) so a recent hub fetch still protects an
 *      offline re-dispense.
 *
 * Allergy status is UNKNOWN (never NKA) when no authoritative source is
 * available: no local record AND hub unreachable AND no fresh cache entry.
 * Stale-cache allergies are still merged into the display/check list (extra
 * protection is never discarded) but do not make the status "known".
 */

/** How long a hub allergy fetch is considered authoritative for offline reuse. */
export const ALLERGY_CACHE_FRESH_MS = 24 * 60 * 60 * 1000 // 24 hours

/** Timeout for the hub allergy fetch — resolution must not stall the scan flow. */
const HUB_FETCH_TIMEOUT_MS = 5000

export interface ResolvedPatientContext {
  /** Normalized (bare) patient id from the prescription's `pat` reference. */
  ref: string
  /** Local registry record, when one exists for this ref. */
  patient: LocalPatient | null
  /** Merged allergy substance displays from every available source. */
  allergies: string[]
  /**
   * true when NO authoritative source could confirm the allergy record
   * (no local record, hub fetch failed/offline, no fresh cache entry).
   * Consumers MUST render this as "allergy status unknown" — never as NKA.
   */
  allergyStatusUnknown: boolean
  /** Provenance (shape only — no PHI) for audit metadata and tests. */
  sources: { local: boolean; hub: boolean; cache: 'fresh' | 'stale' | 'none' }
}

/** Strip an optional "Patient/" prefix — `pat` refs are bare ids in QR payloads. */
export function normalizePatientRef(ref: string): string {
  return ref.replace(/^Patient\//, '')
}

interface HubAllergy {
  substanceText?: string | null
}

/**
 * Fetch the patient's active allergies from the Hub.
 * Returns the substance display list on success (possibly empty = hub-confirmed
 * NKA), or null when the fetch could not be completed (offline, no token,
 * HTTP error, timeout). The null/[] distinction is safety-critical.
 */
async function fetchHubAllergies(patientId: string): Promise<string[] | null> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null
    const token = await useAuthSessionStore.getState().getAccessToken()
    if (!token) return null

    const url = new URL(getHubApiUrl())
    url.pathname = url.pathname.replace(/\/$/, '') + '/allergy.listForDispense'
    url.searchParams.set('input', JSON.stringify({ json: { patientRef: patientId } }))

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HUB_FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }
    if (!res.ok) return null

    const body = (await res.json()) as {
      result: { data: { json: { allergies: HubAllergy[] } } }
    }
    return body.result.data.json.allergies
      .map((a) => a.substanceText ?? '')
      .filter((s) => s.trim().length > 0)
  } catch {
    return null
  }
}

/** Case-insensitive union preserving first-seen casing/order. */
function mergeAllergyLists(...lists: string[][]): string[] {
  const seen = new Set<string>()
  const merged: string[] = []
  for (const list of lists) {
    for (const raw of list) {
      const value = raw.trim()
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(value)
    }
  }
  return merged
}

/**
 * Resolve the patient + allergy context for a scanned prescription.
 * Never throws — a total failure resolves to the UNKNOWN state, which the UI
 * renders as an explicit amber warning requiring override (CLAUDE.md Rule #3/#4).
 */
export async function resolvePatientForDispense(
  patientRefRaw: string,
): Promise<ResolvedPatientContext> {
  const ref = normalizePatientRef(patientRefRaw)

  // 1. Local registry (offline-first). Encrypted middleware decrypts on read.
  let patient: LocalPatient | null = null
  try {
    patient = (await db.patients.get(ref)) ?? null
  } catch {
    patient = null
  }

  // 2. Hub fetch (online) — surfaces OPD-recorded allergies.
  const hubAllergies = await fetchHubAllergies(ref)

  // 3. Cache: refresh on hub success; fall back to it on hub failure.
  let cacheState: 'fresh' | 'stale' | 'none' = 'none'
  let cachedAllergies: string[] = []
  if (hubAllergies !== null) {
    try {
      await db.patientAllergyCache.put({
        patientRef: ref,
        allergies: hubAllergies,
        fetchedAt: new Date().toISOString(),
      })
    } catch {
      // Cache write failure must never block resolution.
    }
  } else {
    try {
      const cached = await db.patientAllergyCache.get(ref)
      if (cached) {
        cachedAllergies = cached.allergies
        const age = Date.now() - new Date(cached.fetchedAt).getTime()
        cacheState = Number.isFinite(age) && age >= 0 && age <= ALLERGY_CACHE_FRESH_MS
          ? 'fresh'
          : 'stale'
      }
    } catch {
      cacheState = 'none'
    }
  }

  const allergies = mergeAllergyLists(
    patient?.allergies ?? [],
    hubAllergies ?? [],
    cachedAllergies,
  )

  // Known only when an authoritative source answered:
  // local record exists, hub fetch succeeded, or the cache is fresh.
  const allergyStatusUnknown =
    patient === null && hubAllergies === null && cacheState !== 'fresh'

  // CLAUDE.md Rule #6: audit the local PHI read (hub reads are audited
  // server-side by allergy.listForDispense). Shape-only metadata — no PHI.
  auditPhiAccess(
    useAuthSessionStore.getState().session?.userId ?? 'unknown',
    AuditAction.READ,
    AuditResourceType.ALLERGY,
    `dispense-resolution:${ref}`,
    ref,
    {
      phiAccess: 'dispense_patient_resolution',
      localRecord: patient !== null,
      hubFetch: hubAllergies !== null,
      cache: cacheState,
      allergyStatusUnknown,
    },
  )

  return {
    ref,
    patient,
    allergies,
    allergyStatusUnknown,
    sources: { local: patient !== null, hub: hubAllergies !== null, cache: cacheState },
  }
}

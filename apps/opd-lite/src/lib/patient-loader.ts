import { db } from '@/lib/db'
import type { FhirPatient, PatientAddress } from '@ultranos/shared-types'
import { EncryptionKeyNotAvailableError } from '@/lib/encryption-key-store'
import { getHubBaseUrl } from '@/lib/hub-url'

// Base URL (no /api/trpc) — callers append `/api/trpc/patient.read` below.
const HUB_API_URL = getHubBaseUrl()

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Normalize a Dexie patient record into a proper FhirPatient shape.
 *
 * The sync pull may have stored the patient as a flat camelCase object
 * (matching the Postgres row layout) rather than the nested FhirPatient
 * structure that UI components expect. This function reconstructs the
 * nested `_ultranos` block from flat fields when needed.
 */
export function normalizeFhirPatient(raw: Record<string, unknown>): FhirPatient {
  // Check if already in the correct nested shape WITH complete data.
  // The patient.getById endpoint may return a partial _ultranos (only isActive,
  // createdAt, etc.) while key fields like addressOrigin, nameGiven are at the
  // top level. We detect this by checking for a key field that should be in _ultranos.
  const ext = raw._ultranos as Record<string, unknown> | undefined
  if (ext && typeof ext === 'object' && 'nameLocal' in ext && 'isNomadic' in ext) {
    return raw as unknown as FhirPatient
  }

  // Reconstruct from flat Hub row (or hybrid format with partial _ultranos)
  // Merge: prefer values from existing _ultranos, then fall back to top-level fields
  const existingExt = (ext ?? {}) as Record<string, unknown>
  const phone = (raw.telecomPhone as string) || (existingExt.telecomPhone as string) || undefined
  return {
    id: raw.id as string,
    resourceType: 'Patient',
    name: (raw.name as FhirPatient['name']) ?? [
      {
        given: (raw.nameGiven as string) ? [raw.nameGiven as string] : [],
        text: (raw.nameLocal as string) ?? '',
      },
    ],
    gender: (raw.gender as FhirPatient['gender']),
    birthDate: (raw.birthDate as string) || undefined,
    birthYearOnly: (raw.birthYearOnly as boolean) ?? true,
    telecom: phone
      ? [{ system: 'phone' as const, value: phone }]
      : (raw.telecom as FhirPatient['telecom']) ?? [],
    _ultranos: {
      nameLocal: (existingExt.nameLocal as string) ?? (raw.nameLocalEnc as string) ?? (raw.nameLocal as string) ?? '',
      nameLatin: (existingExt.nameLatin as string) ?? (raw.nameLatinEnc as string) ?? (raw.nameLatin as string) ?? undefined,
      namePhonetic: (existingExt.namePhonetic as string) ?? (raw.namePhoneticEnc as string) ?? (raw.namePhonetic as string) ?? undefined,
      nationalIdHash: (existingExt.nationalIdHash as string) ?? (raw.nationalIdHash as string) ?? undefined,
      guardianId: (existingExt.guardianId as string) ?? (raw.guardianId as string) ?? undefined,
      consentVersion: (existingExt.consentVersion as string) ?? (raw.consentVersion as string) ?? undefined,
      patient_tier: ((existingExt.patient_tier as string) ?? (raw.patientTier as string) ?? 'FREE') as 'FREE' | 'PREMIUM',
      preferredLanguage: ((existingExt.preferredLanguage as string) ?? (raw.preferredLanguage as string) ?? undefined) as FhirPatient['_ultranos']['preferredLanguage'],
      isActive: (existingExt.isActive as boolean) ?? (raw.isActive as boolean) ?? true,
      createdBy: (existingExt.createdBy as string) ?? (raw.createdBy as string) ?? undefined,
      createdAt: (existingExt.createdAt as string) ?? (raw.createdAt as string) ?? new Date().toISOString(),
      nameGiven: (existingExt.nameGiven as string) ?? (raw.nameGivenEnc as string) ?? (raw.nameGiven as string) ?? undefined,
      nameFather: (existingExt.nameFather as string) ?? (raw.nameFatherEnc as string) ?? (raw.nameFather as string) ?? undefined,
      nameGrandfather: (existingExt.nameGrandfather as string) ?? (raw.nameGrandfatherEnc as string) ?? (raw.nameGrandfather as string) ?? undefined,
      birthYear: (existingExt.birthYear as number) ?? (raw.birthYear as number) ?? undefined,
      addressOrigin: (existingExt.addressOrigin as PatientAddress | undefined)
        // Flat keys from patient.list/search responses cached in _ultranos
        ?? ((existingExt.addressProvinceOrigin as string)
          ? {
              province: existingExt.addressProvinceOrigin as PatientAddress['province'],
              district: (existingExt.addressDistrictOrigin as string) ?? '',
              village: (existingExt.addressVillageOrigin as string) || undefined,
            }
          : undefined)
        // Flat keys at top level from raw Hub row
        ?? (raw.addressProvinceOrigin
          ? {
              province: raw.addressProvinceOrigin as PatientAddress['province'],
              district: (raw.addressDistrictOrigin as string) ?? '',
              village: (raw.addressVillageOrigin as string) || undefined,
            }
          : undefined),
      addressCurrent: (existingExt.addressCurrent as PatientAddress | undefined)
        ?? ((existingExt.addressProvinceCurrent as string)
          ? {
              province: existingExt.addressProvinceCurrent as PatientAddress['province'],
              district: (existingExt.addressDistrictCurrent as string) ?? '',
              village: (existingExt.addressVillageCurrent as string) || undefined,
            }
          : undefined)
        ?? (raw.addressProvinceCurrent
          ? {
              province: raw.addressProvinceCurrent as PatientAddress['province'],
              district: (raw.addressDistrictCurrent as string) ?? '',
              village: (raw.addressVillageCurrent as string) || undefined,
            }
          : undefined),
      isNomadic: (existingExt.isNomadic as boolean) ?? (raw.isNomadic as boolean) ?? false,
      biometricFingerprintHash: (existingExt.biometricFingerprintHash as string) ?? (raw.biometricFingerprintHash as string) ?? undefined,
      biometricAlgorithmVersion: (existingExt.biometricAlgorithmVersion as string) ?? (raw.biometricAlgorithmVersion as string) ?? undefined,
      mpiScore: (existingExt.mpiScore as number) ?? (raw.mpiScore as number) ?? undefined,
      identifiers: (existingExt.identifiers as FhirPatient['_ultranos']['identifiers']) ?? (raw.identifiers as FhirPatient['_ultranos']['identifiers']) ?? undefined,
      photoUrl: (existingExt.photoUrl as string) ?? (raw.photoUrl as string) ?? undefined,
      bloodGroup: (existingExt.bloodGroup as string) ?? (raw.bloodGroup as string) ?? undefined,
      updatedByName: (existingExt.updatedByName as string) ?? undefined,
      updatedByRole: (existingExt.updatedByRole as string) ?? undefined,
    },
    meta: raw.meta as FhirPatient['meta'] ?? {
      lastUpdated: (raw.updatedAt as string) ?? new Date().toISOString(),
      versionId: (raw.metaVersionId as string) ?? undefined,
    },
  }
}

/**
 * Fetch a patient from the Hub API (patient.read) and cache in Dexie.
 * Used as a fallback when the patient isn't available in local IndexedDB
 * (e.g. after sign-out/sign-in, or because the Patient sync pull does not
 * deliver the demographic record to this client).
 */
export async function fetchPatientFromHub(
  patientId: string,
): Promise<FhirPatient | null> {
  try {
    // Dynamic import so that importing this module (and the encounter
    // dashboard / patient chart) does not throw at load time in SSR/test
    // contexts where Supabase env vars are absent. Mirrors usePatientSync.
    const { getSupabaseBrowserClient } = await import('@/lib/supabase')
    const supabase = getSupabaseBrowserClient()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) return null

    const params = encodeURIComponent(
      JSON.stringify({ json: { patientId } }),
    )
    const res = await fetch(
      `${HUB_API_URL}/api/trpc/patient.read?input=${params}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    )

    if (!res.ok) {
      console.warn('[fetchPatientFromHub] patient.read failed:', { status: res.status })
      return null
    }

    const data = await res.json() as {
      result: { data: { json: Record<string, unknown> } }
    }
    const raw = data.result?.data?.json
    if (!raw) return null

    const patient = normalizeFhirPatient(raw)

    // Cache in Dexie so subsequent reads don't hit the Hub
    try {
      await db.patients.put(patient)
    } catch {
      // Non-critical — patient loaded in memory even if cache fails
    }

    return patient
  } catch {
    return null
  }
}

export interface LoadPatientResult {
  /** The resolved patient, or null if not found anywhere. */
  patient: FhirPatient | null
  /** True when the encryption key is unavailable and the user must re-auth. */
  needsReauth: boolean
  /** Where the patient came from — for audit/telemetry. */
  source: 'dexie' | 'hub' | null
}

/**
 * Resolve a patient by id with offline-first resilience:
 *
 * 1. Read from local IndexedDB (Dexie) for instant, offline display.
 * 2. If the encryption key is unavailable, signal re-auth (we can neither
 *    decrypt local data nor safely cache a Hub result).
 * 3. If absent locally, fall back to the Hub `patient.read` endpoint and
 *    cache the result. This covers the gap where the Patient sync pull does
 *    not deliver the demographic record to the client.
 *
 * When `refreshFromHub` is true, the Hub is also queried even when a local
 * record exists, so partial records (e.g. cached from search/list) are
 * upgraded to the full FHIR-aligned patient. The local record is returned
 * first by the caller for instant display; this function returns the most
 * complete record it can resolve.
 */
export async function loadPatientResilient(
  patientId: string,
  opts: { refreshFromHub?: boolean } = {},
): Promise<LoadPatientResult> {
  let local: FhirPatient | null = null

  try {
    const raw = await db.patients.get(patientId)
    if (raw) {
      local = normalizeFhirPatient(raw as unknown as Record<string, unknown>)
    }
  } catch (err) {
    if (err instanceof EncryptionKeyNotAvailableError) {
      // Can't decrypt local data and can't safely cache a Hub result.
      return { patient: null, needsReauth: true, source: null }
    }
    // Other Dexie errors (e.g. corrupt record) — fall through to the Hub.
  }

  if (local && !opts.refreshFromHub) {
    return { patient: local, needsReauth: false, source: 'dexie' }
  }

  const hubPatient = await fetchPatientFromHub(patientId)
  if (hubPatient) {
    return { patient: hubPatient, needsReauth: false, source: 'hub' }
  }

  // Hub fetch failed — fall back to whatever local record we have (if any).
  return {
    patient: local,
    needsReauth: false,
    source: local ? 'dexie' : null,
  }
}

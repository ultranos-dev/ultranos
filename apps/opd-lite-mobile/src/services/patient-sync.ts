/**
 * Background sync service — fetches updated patients from Hub API.
 * Uses tRPC raw fetch pattern (avoids cross-app build dependency).
 * Merge strategy: LWW for Tier 3 (demographics), append-only for Tier 1 (allergies, active meds).
 */
import { deserializeHlc, compareHlc } from '@ultranos/sync-engine'

import { getDatabase } from '../lib/db'
import { hashNationalId } from '../lib/hash-national-id'
import type { FhirPatient } from '@ultranos/shared-types'

const HUB_API_BASE = process.env.EXPO_PUBLIC_HUB_API_BASE ?? 'https://hub.ultranos.com'

interface SyncResult {
  synced: number
  errors: number
}

/**
 * Fetch updated patients from Hub API and merge into local SQLCipher DB.
 * @param lastSyncTimestamp - ISO 8601 timestamp of last successful sync
 * @param authToken - JWT access token for Hub API
 */
export async function syncPatients(
  lastSyncTimestamp: string | null,
  authToken: string
): Promise<SyncResult> {
  const url = new URL('/api/trpc/patient.list', HUB_API_BASE)
  if (lastSyncTimestamp) {
    url.searchParams.set('input', JSON.stringify({ since: lastSyncTimestamp }))
  }

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

  const data = await response.json()
  const remotePatients: FhirPatient[] = data.result?.data ?? []

  const db = await getDatabase()
  let synced = 0
  let errors = 0

  for (const remotePatient of remotePatients) {
    try {
      await mergePatient(db, remotePatient)
      synced++
    } catch {
      errors++
    }
  }

  return { synced, errors }
}

/**
 * Merge a remote patient into local SQLCipher.
 * - Tier 3 fields (demographics): LWW by HLC meta.lastUpdated
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

  // Compare HLC timestamps for Tier 3 (demographics) — newer wins
  const remoteHlc = deserializeHlc(remotePatient.meta.lastUpdated)
  const localHlc = deserializeHlc(localPatient.meta.lastUpdated)
  const useRemoteDemographics = compareHlc(remoteHlc, localHlc) > 0

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

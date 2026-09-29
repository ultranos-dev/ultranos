'use client'

import { db } from './db'
import { hashNationalId } from './hash-national-id'
import { encryptionKeyStore } from './encryption-key-store'
import { searchPatientsOnHub } from './trpc'
import type { FhirPatient } from '@ultranos/shared-types'
import type {
  PatientSearchResponse,
  PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'

const LOCAL_SEARCH_LIMIT = 50

function formatAge(birthDate?: string, birthYearOnly?: boolean): string {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  const now = new Date()
  if (birthYearOnly) return `~${now.getFullYear() - birth.getFullYear()}y`
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return `${age}y`
}

function getDisplayName(p: FhirPatient): string {
  return p._ultranos?.nameLocal || p.name?.[0]?.text || 'Unknown'
}

function toResult(p: FhirPatient): PatientSearchResult {
  return {
    id: p.id,
    displayName: getDisplayName(p),
    gender: p.gender ?? null,
    ageLabel: formatAge(p.birthDate, p.birthYearOnly),
    phone: p.telecom?.find((c) => c.system === 'phone')?.value ?? null,
    raw: p,
  }
}

/**
 * Local-first patient search over Dexie: matches by NAME (nameLocal/nameLatin,
 * prefix), by PATIENT ID (uuid prefix), and by NATIONAL ID (HMAC blind index).
 * Decrypt-and-filter in memory (name fields aren't indexed post Story 28.6).
 */
async function searchLocal(query: string): Promise<FhirPatient[]> {
  const trimmed = query.trim()
  if (!trimmed || !encryptionKeyStore.isReady()) return []
  const q = trimmed.toLocaleLowerCase()

  const all = await db.patients.toArray()

  const byName = all.filter((p) => {
    const nameLocal = ((p._ultranos as { nameLocal?: string })?.nameLocal ?? '').toLocaleLowerCase()
    const nameLatin = ((p._ultranos as { nameLatin?: string })?.nameLatin ?? '').toLocaleLowerCase()
    return nameLocal.startsWith(q) || nameLatin.startsWith(q)
  })

  // Patient ID (uuid) — exact or prefix, so a scanned/looked-up id resolves.
  const byPatientId = all.filter((p) => p.id.toLocaleLowerCase().startsWith(q))

  // National ID — blind index (HMAC-SHA256) exact match; still indexed/fast.
  const idHash = await hashNationalId(trimmed)
  const byNationalId = await db.patients
    .where('_ultranos.nationalIdHash')
    .equals(idHash)
    .toArray()

  const seen = new Set<string>()
  const merged: FhirPatient[] = []
  for (const p of [...byName, ...byPatientId, ...byNationalId]) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      merged.push(p)
    }
  }
  return merged.slice(0, LOCAL_SEARCH_LIMIT)
}

/**
 * The OPD-lite `search` adapter for the shared `PatientSearchBar`: Phase 1 local
 * Dexie search, Phase 2 background Hub revalidation (merged), normalized to
 * `PatientSearchResult`. Offline-safe — Hub failure is reported via `hubUnavailable`.
 */
export async function searchPatientsAdapter(
  query: string,
  signal: AbortSignal,
): Promise<PatientSearchResponse> {
  if (!encryptionKeyStore.isReady()) return { results: [] }

  const local = await searchLocal(query)
  let merged = local
  let hubUnavailable = false

  try {
    const hub = await searchPatientsOnHub(query.trim(), signal)
    if (!signal.aborted && hub.patients.length > 0) {
      await db.patients.bulkPut(hub.patients)
      merged = await searchLocal(query)
    }
  } catch {
    if (!signal.aborted) hubUnavailable = true
  }

  return { results: merged.map(toResult), hubUnavailable }
}

'use client'

import { db, type LocalPatient } from '@/lib/db'
import { searchPatientsLocal, searchPatientsHub } from '@/lib/patient-search'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'
import type {
  PatientSearchResponse,
  PatientSearchResult,
} from '@ultranos/patient-kit/components/search/patient-search-bar'

function getDisplayName(p: LocalPatient): string {
  return [p.nameGiven, p.nameFather].filter(Boolean).join(' ') || p.nameGiven
}

function getAgeLabel(p: LocalPatient): string {
  return p.birthYear ? `${new Date().getFullYear() - p.birthYear}y` : ''
}

function toResult(p: LocalPatient): PatientSearchResult {
  return {
    id: p.id,
    displayName: getDisplayName(p),
    gender: p.gender,
    ageLabel: getAgeLabel(p),
    phone: p.phone ?? null,
    hasAllergies: (p.allergies?.length ?? 0) > 0,
    raw: p,
  }
}

/**
 * Pharmacy-lite `search` adapter for the shared `PatientSearchBar`. Local Dexie
 * search by NAME/phone (searchPatientsLocal) + PATIENT ID (indexed primary key,
 * no decrypt) merged with background Hub revalidation. National ID is matched
 * server-side via the Hub query (pharmacy's local model stores no NID hash).
 */
export async function searchPatientsAdapter(
  query: string,
  signal: AbortSignal,
): Promise<PatientSearchResponse> {
  if (!encryptionKeyStore.isReady()) return { results: [] }
  const trimmed = query.trim()
  if (trimmed.length < 2) return { results: [] }

  const merged = new Map<string, LocalPatient>()

  // Name + phone (decrypt-and-filter).
  for (const p of await searchPatientsLocal(trimmed)) merged.set(p.id, p)

  // Patient ID — indexed primary key prefix, no decrypt needed.
  try {
    const byId = await db.patients.where('id').startsWithIgnoreCase(trimmed).limit(20).toArray()
    for (const p of byId) merged.set(p.id, p)
  } catch {
    // Non-fatal — name/phone results still stand.
  }

  // Phase 2: Hub revalidation (also resolves National ID server-side).
  let hubUnavailable = false
  try {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      const token = await useAuthSessionStore.getState().getAccessToken()
      if (token && !signal.aborted) {
        const hub = await searchPatientsHub(trimmed, getHubApiUrl(), token, signal)
        for (const p of hub) merged.set(p.id, p)
      }
    }
  } catch {
    if (!signal.aborted) hubUnavailable = true
  }

  return { results: Array.from(merged.values()).map(toResult), hubUnavailable }
}

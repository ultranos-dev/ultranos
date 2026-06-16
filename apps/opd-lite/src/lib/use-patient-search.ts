'use client'

import { useCallback } from 'react'
import { usePatientStore } from '@/stores/patient-store'
import { useSync } from '@/lib/use-sync'
import { db } from '@/lib/db'
import { hashNationalId } from '@/lib/hash-national-id'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { FhirPatient } from '@ultranos/shared-types'

const LOCAL_SEARCH_LIMIT = 50
const SESSION_REQUIRED_ERROR = 'Session required for patient search'

/**
 * Hook encapsulating the local-first patient search logic.
 * Phase 1: Searches Dexie (local cache) via in-memory decrypt-and-filter — works offline.
 * Phase 2: Background Hub API revalidation — merges remote results.
 *
 * Story 28.6: nameLocal and nameLatin are no longer Dexie indexed fields.
 * toArray() returns all records decrypted by middleware; filter runs in JS.
 */
export function usePatientSearch() {
  const { setQuery, setResults, setIsSearching, setSearchError } = usePatientStore()
  const { revalidate } = useSync()

  const search = useCallback(
    async (query: string) => {
      setQuery(query)

      if (!query.trim()) {
        setResults([])
        setIsSearching(false)
        setSearchError(null)
        return
      }

      // Guard: encryption key must be available before any Dexie access.
      if (!encryptionKeyStore.isReady()) {
        setResults([])
        setIsSearching(false)
        setSearchError(SESSION_REQUIRED_ERROR)
        return
      }

      setIsSearching(true)
      setSearchError(null)

      // Phase 1: Local in-memory decrypt-and-filter search
      const localResults = await searchLocal(query)
      setResults(localResults)
      setIsSearching(false)

      // Phase 2: Background Hub API revalidation (non-blocking)
      revalidate(query)
        .then((hubPatients) => {
          if (hubPatients.length > 0) {
            // Guard against stale responses: only update if query hasn't changed
            const currentQuery = usePatientStore.getState().query
            if (currentQuery !== query) return

            searchLocal(query).then((merged) => {
              // Re-check after async searchLocal
              if (usePatientStore.getState().query === query) {
                usePatientStore.getState().setResults(merged)
              }
            })
          }
        })
        .catch(() => {
          // Revalidate has internal error handling; this catches
          // errors from the .then() callback (searchLocal/setResults)
        })
    },
    [setQuery, setResults, setIsSearching, setSearchError, revalidate]
  )

  return { search }
}

async function searchLocal(query: string): Promise<FhirPatient[]> {
  if (!encryptionKeyStore.isReady()) return []

  const trimmed = query.trim()
  if (!trimmed) return []

  const q = trimmed.toLocaleLowerCase()

  // In-memory decrypt-and-filter: toArray() returns decrypted records via middleware.
  // nameLocal and nameLatin are no longer indexed (Story 28.6 / Dexie v22).
  const all = await db.patients.toArray()

  const byName = all.filter((p) => {
    const nameLocal = ((p._ultranos as { nameLocal?: string })?.nameLocal ?? '').toLocaleLowerCase()
    const nameLatin = ((p._ultranos as { nameLatin?: string })?.nameLatin ?? '').toLocaleLowerCase()
    return nameLocal.startsWith(q) || nameLatin.startsWith(q)
  })

  // National ID search: blind index (HMAC-SHA256) remains indexed — still fast.
  const idHash = await hashNationalId(trimmed)
  const byId = await db.patients
    .where('_ultranos.nationalIdHash')
    .equals(idHash)
    .toArray()

  // Deduplicate by patient id, name matches first
  const seen = new Set<string>()
  const merged: FhirPatient[] = []
  for (const patient of [...byName, ...byId]) {
    if (!seen.has(patient.id)) {
      seen.add(patient.id)
      merged.push(patient)
    }
  }

  return merged.slice(0, LOCAL_SEARCH_LIMIT)
}

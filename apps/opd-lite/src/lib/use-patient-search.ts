'use client'

import { useCallback } from 'react'
import { usePatientStore } from '@/stores/patient-store'
import { useSync } from '@/lib/use-sync'
import { db } from '@/lib/db'
import { hashNationalId } from '@/lib/hash-national-id'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import type { FhirPatient } from '@ultranos/shared-types'

const LOCAL_SEARCH_LIMIT = 50

/**
 * Hook encapsulating the local-first patient search logic.
 * Phase 1: Searches Dexie (local cache) — fast, indexed, works offline.
 * Phase 2: Background Hub API revalidation — merges remote results.
 */
export function usePatientSearch() {
  const { setQuery, setResults, setIsSearching } = usePatientStore()
  const { revalidate } = useSync()

  const search = useCallback(
    async (query: string) => {
      setQuery(query)

      if (!query.trim()) {
        setResults([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)

      // Phase 1: Local Dexie search (fast — indexed fields)
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
    [setQuery, setResults, setIsSearching, revalidate]
  )

  return { search }
}

async function searchLocal(query: string): Promise<FhirPatient[]> {
  if (!encryptionKeyStore.isReady()) return []

  const trimmed = query.trim()

  // Search by nameLocal (starts-with, case-insensitive)
  const byName = await db.patients
    .where('_ultranos.nameLocal')
    .startsWithIgnoreCase(trimmed)
    .limit(LOCAL_SEARCH_LIMIT)
    .toArray()

  // Search by nationalIdHash (hash input then exact match)
  const idHash = await hashNationalId(trimmed)
  const byId = await db.patients
    .where('_ultranos.nationalIdHash')
    .equals(idHash)
    .limit(LOCAL_SEARCH_LIMIT)
    .toArray()

  // Search by Latin name
  const byLatin = await db.patients
    .where('_ultranos.nameLatin')
    .startsWithIgnoreCase(trimmed)
    .limit(LOCAL_SEARCH_LIMIT)
    .toArray()

  // Deduplicate by patient id
  const seen = new Set<string>()
  const merged: FhirPatient[] = []
  for (const patient of [...byName, ...byLatin, ...byId]) {
    if (!seen.has(patient.id)) {
      seen.add(patient.id)
      merged.push(patient)
    }
  }

  return merged
}

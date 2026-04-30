'use client'

import { useCallback, useRef } from 'react'
import { usePatientStore } from '@/stores/patient-store'
import { searchPatientsOnHub } from '@/lib/trpc'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'

/**
 * Background revalidation hook — fetches from Hub API and merges into local Dexie cache.
 * Offline-safe: failures are caught silently, sync status updated in store.
 */
export function useSync() {
  const { setSyncStatus } = usePatientStore()
  const abortRef = useRef<AbortController | null>(null)

  const revalidate = useCallback(
    async (query: string): Promise<FhirPatient[]> => {
      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort()
      }
      abortRef.current = new AbortController()

      const signal = abortRef.current.signal
      setSyncStatus({ isPending: true, isError: false, lastSyncedAt: null })

      try {
        const result = await searchPatientsOnHub(query, signal)
        const hubPatients = result.patients

        // Merge Hub results into local Dexie cache
        if (hubPatients.length > 0) {
          await db.patients.bulkPut(hubPatients)
        }

        setSyncStatus({
          isPending: false,
          isError: false,
          lastSyncedAt: new Date().toISOString(),
        })

        return hubPatients
      } catch {
        // Offline or Hub unavailable — not an error for the user
        setSyncStatus({
          isPending: false,
          isError: true,
          lastSyncedAt: usePatientStore.getState().syncStatus.lastSyncedAt,
        })
        return []
      }
    },
    [setSyncStatus]
  )

  return { revalidate }
}

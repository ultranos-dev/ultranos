'use client'

import { useCallback, useRef } from 'react'
import { listPatientsFromHub } from '@/lib/trpc'
import { db } from '@/lib/db'
import type { FhirPatient } from '@ultranos/shared-types'

/**
 * Page through the Hub API patient.list endpoint and bulk-insert every patient
 * into local IndexedDB. Plain async utility (not hook-bound) so it can also be
 * called imperatively on login by the SyncProvider — not just on directory mount.
 * Offline-safe: failures are caught silently; returns whatever was fetched.
 */
export async function syncAllPatientsToDb(signal?: AbortSignal): Promise<FhirPatient[]> {
  const allPatients: FhirPatient[] = []
  let cursor: string | undefined

  try {
    // Page through all patients from the Hub
    while (true) {
      if (signal?.aborted) break

      const result = await listPatientsFromHub(cursor, 50, signal)
      const page = result.patients

      if (page.length > 0) {
        allPatients.push(...page)
        await db.patients.bulkPut(page)
      }

      if (!result.nextCursor) break
      cursor = result.nextCursor
    }
  } catch {
    // Offline or Hub unavailable — return whatever we fetched so far
  }

  return allPatients
}

/**
 * Hook that pages through the Hub API patient.list endpoint
 * and bulk-inserts all patients into local IndexedDB.
 * Designed for the PatientDirectory background sync on mount.
 * Offline-safe: failures are caught silently.
 */
export function usePatientListSync() {
  const abortRef = useRef<AbortController | null>(null)

  const syncAll = useCallback(async (): Promise<FhirPatient[]> => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = new AbortController()
    return syncAllPatientsToDb(abortRef.current.signal)
  }, [])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  return { syncAll, cancel }
}

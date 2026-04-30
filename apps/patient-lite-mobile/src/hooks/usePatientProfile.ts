import { useState, useEffect, useCallback, useRef } from 'react'
import type { FhirPatient } from '@ultranos/shared-types'
import {
  loadPatientProfile,
  savePatientProfile,
  clearPatientProfile,
} from '@/lib/offline-store'
import { emitAuditEvent } from '@/lib/audit'

interface UsePatientProfileResult {
  patient: FhirPatient | null
  isLoading: boolean
  error: string | null
  /** Force refresh from local store */
  refresh: () => Promise<void>
  /** Update the cached profile (called by sync engine) */
  updateProfile: (patient: FhirPatient) => Promise<void>
  /** Clear cached profile (logout) */
  clearProfile: () => Promise<void>
}

/**
 * Hook to manage the patient's profile with offline-first strategy.
 *
 * 1. Loads from local encrypted storage first (instant).
 * 2. When Hub is reachable, sync engine updates local cache.
 * 3. PWA: memory-only storage, wiped on tab close per Key-in-Memory policy.
 */
export function usePatientProfile(): UsePatientProfileResult {
  const [patient, setPatient] = useState<FhirPatient | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const opSeq = useRef(0)

  const loadFromStore = useCallback(async () => {
    const seq = ++opSeq.current
    try {
      setIsLoading(true)
      setError(null)
      const stored = await loadPatientProfile()
      if (seq !== opSeq.current) return // stale — a newer op superseded us
      if (stored) {
        emitAuditEvent({
          action: 'PHI_READ',
          resourceType: 'Patient',
          resourceId: stored.id,
          patientId: stored.id,
          outcome: 'success',
        })
      }
      setPatient(stored)
    } catch (err) {
      if (seq !== opSeq.current) return
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load profile from local storage',
      )
    } finally {
      if (seq === opSeq.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadFromStore()
  }, [loadFromStore])

  const updateProfile = useCallback(async (updated: FhirPatient) => {
    const seq = ++opSeq.current
    try {
      await savePatientProfile(updated)
      emitAuditEvent({
        action: 'PHI_WRITE',
        resourceType: 'Patient',
        resourceId: updated.id,
        patientId: updated.id,
        outcome: 'success',
      })
      if (seq !== opSeq.current) return
      setPatient(updated)
      setError(null)
    } catch (err) {
      if (seq !== opSeq.current) return
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save profile update',
      )
    }
  }, [])

  const clearProfile = useCallback(async () => {
    const patientId = patient?.id
    try {
      await clearPatientProfile()
      if (patientId) {
        emitAuditEvent({
          action: 'PHI_DELETE',
          resourceType: 'Patient',
          resourceId: patientId,
          patientId,
          outcome: 'success',
        })
      }
      setPatient(null)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to clear profile',
      )
    }
  }, [patient?.id])

  return {
    patient,
    isLoading,
    error,
    refresh: loadFromStore,
    updateProfile,
    clearProfile,
  }
}

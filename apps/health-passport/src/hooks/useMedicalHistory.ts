import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { FhirEncounterZod } from '@ultranos/shared-types'
import type { FhirMedicationRequestZod } from '@ultranos/shared-types'
import { loadMedicalHistory, type StoredMedicalHistory } from '@/lib/offline-store'
import { emitAuditEvent } from '@/lib/audit'
import {
  humanizeEncounter,
  humanizeMedication,
  type SupportedLocale,
  type IconCategory,
} from '@/lib/fhir-humanizer'

export interface TimelineEvent {
  id: string
  type: 'encounter' | 'medication'
  date: string
  label: string
  icon: IconCategory
  isSensitive: boolean
  status: string
  /** Raw resource for detail view */
  resource: FhirEncounterZod | FhirMedicationRequestZod
}

export interface UseMedicalHistoryResult {
  events: TimelineEvent[]
  activeMedications: TimelineEvent[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function encounterToEvent(
  encounter: FhirEncounterZod,
  locale: SupportedLocale,
): TimelineEvent {
  const humanized = humanizeEncounter(encounter.reasonCode, locale)
  return {
    id: encounter.id,
    type: 'encounter',
    date: encounter.period?.start ?? encounter._ultranos.createdAt,
    label: humanized.label,
    icon: humanized.icon,
    isSensitive: humanized.isSensitive,
    status: encounter.status,
    resource: encounter,
  }
}

function medicationToEvent(
  med: FhirMedicationRequestZod,
  locale: SupportedLocale,
): TimelineEvent {
  const humanized = humanizeMedication(med.medicationCodeableConcept, locale)
  return {
    id: med.id,
    type: 'medication',
    date: med.authoredOn,
    label: humanized.label,
    icon: humanized.icon,
    isSensitive: humanized.isSensitive,
    status: med.status,
    resource: med,
  }
}

/**
 * Hook to load and merge encounters + medications into a unified timeline.
 */
export function useMedicalHistory(
  patientId: string | undefined,
  locale: SupportedLocale = 'en',
): UseMedicalHistoryResult {
  const [data, setData] = useState<StoredMedicalHistory | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const opSeq = useRef(0)

  const load = useCallback(async () => {
    if (!patientId) {
      setData(null)
      setIsLoading(false)
      return
    }

    const seq = ++opSeq.current
    try {
      setIsLoading(true)
      setError(null)
      const stored = await loadMedicalHistory(patientId)
      if (seq !== opSeq.current) return

      if (stored) {
        emitAuditEvent({
          action: 'PHI_READ',
          resourceType: 'Encounter',
          resourceId: 'medical-history-bundle',
          patientId,
          outcome: 'success',
          metadata: {
            encounterCount: String(stored.encounters.length),
          },
        })
        if (stored.medications.length > 0) {
          emitAuditEvent({
            action: 'PHI_READ',
            resourceType: 'MedicationRequest',
            resourceId: 'medical-history-bundle',
            patientId,
            outcome: 'success',
            metadata: {
              medicationCount: String(stored.medications.length),
            },
          })
        }
      }

      setData(stored)
    } catch (err) {
      if (seq !== opSeq.current) return
      emitAuditEvent({
        action: 'PHI_READ',
        resourceType: 'Encounter',
        resourceId: 'medical-history-bundle',
        patientId,
        outcome: 'failure',
      })
      // Never expose raw error messages — may contain PHI (storage keys, patient IDs)
      setError('Failed to load medical history')
    } finally {
      if (seq === opSeq.current) {
        setIsLoading(false)
      }
    }
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  const events = useMemo<TimelineEvent[]>(() => {
    if (!data) return []

    const encounterEvents = data.encounters.map((e) =>
      encounterToEvent(e, locale),
    )
    const medicationEvents = data.medications.map((m) =>
      medicationToEvent(m, locale),
    )

    return [...encounterEvents, ...medicationEvents].sort(
      (a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0),
    )
  }, [data, locale])

  const activeMedications = useMemo<TimelineEvent[]>(() => {
    if (!data) return []
    return data.medications
      .filter((m) => m.status === 'active')
      .map((m) => medicationToEvent(m, locale))
      .sort(
        (a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0),
      )
  }, [data, locale])

  return {
    events,
    activeMedications,
    isLoading,
    error,
    refresh: load,
  }
}

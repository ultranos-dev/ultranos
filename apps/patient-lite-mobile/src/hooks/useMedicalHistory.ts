import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { FhirEncounterZod, FhirMedicationRequestZod } from '@ultranos/shared-types'
import type { FhirAllergyIntolerance } from '@ultranos/shared-types'
import { loadMedicalHistory, type StoredMedicalHistory } from '@/lib/offline-store'
import { emitAuditEvent } from '@/lib/audit'
import { getSubstanceName } from '@/data/allergy-queries'
import {
  humanizeEncounter,
  humanizeMedication,
  type SupportedLocale,
  type IconCategory,
} from '@/lib/fhir-humanizer'

export interface TimelineEvent {
  id: string
  type: 'encounter' | 'medication' | 'allergy'
  date: string
  label: string
  icon: IconCategory
  isSensitive: boolean
  status: string
  /** Raw resource for detail view */
  resource: FhirEncounterZod | FhirMedicationRequestZod | FhirAllergyIntolerance
}

export interface UseMedicalHistoryResult {
  events: TimelineEvent[]
  activeMedications: TimelineEvent[]
  activeAllergies: FhirAllergyIntolerance[]
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

function allergyToEvent(
  allergy: FhirAllergyIntolerance,
): TimelineEvent {
  return {
    id: allergy.id,
    type: 'allergy',
    date: allergy.recordedDate ?? allergy._ultranos?.createdAt ?? new Date().toISOString(),
    label: getSubstanceName(allergy),
    icon: 'warning' as IconCategory,
    isSensitive: false,
    status: allergy.clinicalStatus?.coding?.[0]?.code ?? 'active',
    resource: allergy,
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
        if (stored.allergies && stored.allergies.length > 0) {
          emitAuditEvent({
            action: 'PHI_READ',
            resourceType: 'AllergyIntolerance',
            resourceId: 'medical-history-bundle',
            patientId,
            outcome: 'success',
            metadata: {
              allergyCount: String(stored.allergies.length),
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
    const allergyEvents = (data.allergies ?? []).map(allergyToEvent)

    return [...encounterEvents, ...medicationEvents, ...allergyEvents].sort(
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

  const activeAllergies = useMemo<FhirAllergyIntolerance[]>(() => {
    if (!data?.allergies) return []
    return data.allergies.filter(
      (a) => a.clinicalStatus?.coding?.[0]?.code === 'active',
    )
  }, [data])

  return {
    events,
    activeMedications,
    activeAllergies,
    isLoading,
    error,
    refresh: load,
  }
}

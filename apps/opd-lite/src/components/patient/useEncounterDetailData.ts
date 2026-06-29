'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type {
  LocalObservation,
  LocalCondition,
  LocalMedicationRequest,
  LocalAllergyIntolerance,
  SoapLedgerEntry,
} from '@/lib/db'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'

export interface EncounterDetailData {
  vitals: LocalObservation[]
  soap: SoapLedgerEntry | null
  allSoapEntries: SoapLedgerEntry[]
  diagnoses: LocalCondition[]
  prescriptions: LocalMedicationRequest[]
  allergiesAtVisit: LocalAllergyIntolerance[]
}

/** Present a single vital observation as a label/value pair. */
export function formatVital(obs: LocalObservation): { label: string; value: string } {
  const code = obs.code?.coding?.[0]?.display || obs.code?.text || 'Unknown'
  const val = obs.valueQuantity
    ? `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`
    : (obs as LocalObservation & { valueString?: string }).valueString ?? '-'
  return { label: code, value: val.trim() }
}

/**
 * Load the full clinical detail for an encounter from Dexie (offline-first) and
 * emit a PHI access audit event. Shared by the inline EncounterDetail view and
 * the encounter-detail modal.
 *
 * `enabled` lets callers (e.g. a modal) defer loading until they are shown.
 */
export function useEncounterDetailData(
  encounterId: string,
  patientId: string,
  options?: { encounterDate?: string; enabled?: boolean; phiAccessLabel?: string },
): { data: EncounterDetailData | null; loading: boolean } {
  const { encounterDate, enabled = true, phiAccessLabel = 'encounter_detail_expansion' } = options ?? {}
  const [data, setData] = useState<EncounterDetailData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)

    async function loadDetail() {
      try {
        // Load all detail data in parallel
        const [vitals, soapEntries, diagnoses, prescriptions, allAllergies] = await Promise.all([
          db.observations.where('encounter.reference').equals(`Encounter/${encounterId}`).toArray(),
          db.soapLedger.where('encounterId').equals(encounterId).toArray(),
          db.conditions.where('encounter.reference').equals(`Encounter/${encounterId}`).toArray(),
          db.medications.where('encounter.reference').equals(`Encounter/${encounterId}`).toArray(),
          db.allergyIntolerances.where('patient.reference').equals(`Patient/${patientId}`).toArray(),
        ])

        // Get latest SOAP entry
        soapEntries.sort((a: SoapLedgerEntry, b: SoapLedgerEntry) =>
          b.hlcTimestamp.localeCompare(a.hlcTimestamp),
        )
        const latestSoap = soapEntries[0] ?? null

        // Filter allergies to those recorded at or before encounter date.
        // Safety: if encounterDate is invalid, show ALL allergies
        // (CLAUDE.md Rule #4 — never suppress allergy data).
        let allergiesAtVisit = allAllergies
        if (encounterDate) {
          const encDate = new Date(encounterDate)
          if (!isNaN(encDate.getTime())) {
            allergiesAtVisit = allAllergies.filter((a) => {
              const recorded = a.recordedDate ?? a._ultranos?.hlcTimestamp?.split('_')[0]
              if (!recorded) return true // include if no date info
              const recordedDate = new Date(recorded)
              if (isNaN(recordedDate.getTime())) return true // include if recorded date is invalid
              return recordedDate <= encDate
            })
          }
        }

        if (!cancelled) {
          setData({
            vitals,
            soap: latestSoap,
            allSoapEntries: soapEntries,
            diagnoses,
            prescriptions,
            allergiesAtVisit,
          })
          auditPhiAccess(AuditAction.READ, AuditResourceType.ENCOUNTER, encounterId, patientId, {
            phiAccess: phiAccessLabel,
          })
        }
      } catch {
        // Audit the failed access attempt — CLAUDE.md Rule #6 requires every PHI access to be audited
        if (!cancelled) {
          auditPhiAccess(AuditAction.READ, AuditResourceType.ENCOUNTER, encounterId, patientId, {
            phiAccess: phiAccessLabel,
            accessFailed: true,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDetail()
    return () => {
      cancelled = true
    }
  }, [encounterId, patientId, encounterDate, enabled, phiAccessLabel])

  return { data, loading }
}

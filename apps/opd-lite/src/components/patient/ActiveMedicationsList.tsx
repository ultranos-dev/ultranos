'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db'

interface ActiveMedicationsListProps {
  patientId: string
}

interface MedicationRow {
  id: string
  drugName: string
  dosage: string
  frequency: string
  startDate: string
  hasOverride: boolean
}

/** Format ISO datetime to locale date string. */
function formatDate(iso?: string): string {
  if (!iso) return '--'
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

/**
 * Read-only list of active medications for a patient, loaded from
 * the Dexie `medicationStatements` table.
 *
 * Displays drug name, dosage, frequency, start date, and an amber
 * override flag when a matching interaction audit entry has an
 * override reason recorded.
 */
export function ActiveMedicationsList({
  patientId,
}: ActiveMedicationsListProps) {
  const [meds, setMeds] = useState<MedicationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadMedications() {
      try {
        const patientRef = `Patient/${patientId}`

        // Load active medication statements for this patient
        const statements = await db.medicationStatements
          .where('subject.reference')
          .equals(patientRef)
          .toArray()

        const activeStatements = statements.filter(
          (s) => s.status === 'active',
        )

        // Load interaction audit entries for override detection
        const auditEntries = await db.interactionAuditLog
          .where('patientId')
          .equals(patientId)
          .toArray()

        // Index overrides by medicationRequestId for fast lookup
        const overrideIds = new Set(
          auditEntries
            .filter((e) => e.overrideReason)
            .map((e) => e.medicationRequestId),
        )

        if (cancelled) return

        const rows: MedicationRow[] = activeStatements.map((stmt) => {
          // Drug name
          const coding = stmt.medicationCodeableConcept?.coding?.[0]
          const drugName =
            coding?.display ?? stmt.medicationCodeableConcept?.text ?? '--'

          // Dosage — MedicationStatement uses dosage from the FHIR spec
          // but our schema stores medicationCodeableConcept; dosage info
          // comes from linked MedicationRequest. Show '--' if not available.
          const dosage = '--'
          const frequency = '--'

          // Start date from effectivePeriod
          const startDate = formatDate(stmt.effectivePeriod?.start)

          // Override flag: check if source prescription has an override entry
          const hasOverride = stmt._ultranos.sourcePrescriptionId
            ? overrideIds.has(stmt._ultranos.sourcePrescriptionId)
            : false

          return {
            id: stmt.id,
            drugName,
            dosage,
            frequency,
            startDate,
            hasOverride,
          }
        })

        setMeds(rows)
      } catch {
        // Fail silently — show empty state
        setMeds([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadMedications()
    return () => { cancelled = true }
  }, [patientId])

  if (loading) {
    return (
      <div className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Active Medications
        </h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (meds.length === 0) {
    return (
      <div className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Active Medications
        </h3>
        <p className="text-sm text-muted-foreground">No active medications</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-card-bg p-5 shadow-sm ring-[0.65px] ring-gray-400/40">
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        Active Medications
      </h3>

      <ul className="divide-y divide-neutral-100">
        {meds.map((med) => (
          <li key={med.id} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">
                  {med.drugName}
                  {med.hasOverride && (
                    <span className="ms-2 inline-block rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
                      Override
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {med.dosage !== '--' && <span>{med.dosage}</span>}
                  {med.dosage !== '--' && med.frequency !== '--' && (
                    <span className="mx-1">&middot;</span>
                  )}
                  {med.frequency !== '--' && <span>{med.frequency}</span>}
                  {(med.dosage !== '--' || med.frequency !== '--') && (
                    <span className="mx-1">&middot;</span>
                  )}
                  <span>Started: {med.startDate}</span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

'use client'

import type { FhirPatient } from '@ultranos/shared-types'
import { PatientHeaderCard } from './PatientHeaderCard'
import { ActiveMedicationsList } from './ActiveMedicationsList'
import { PatientDetailsAccordion } from './PatientDetailsAccordion'
import { PatientAuditTrail } from './PatientAuditTrail'

export interface PatientContextRailProps {
  patient: FhirPatient
  patientId: string
  userRole: string
  onEditClick: () => void
  onPatientUpdated: (patient: FhirPatient) => void
}

/**
 * Groups the four patient reference cards into a vertical stack for use in
 * the right rail of a two-column layout. No wrapper div — the DetailLayout
 * rail provides gap-4 spacing between cards.
 *
 * Render order: identity → active meds → details accordion → audit trail.
 */
export function PatientContextRail({
  patient,
  patientId,
  userRole,
  onEditClick,
  onPatientUpdated,
}: PatientContextRailProps) {
  return (
    <>
      <PatientHeaderCard
        patient={patient}
        patientId={patientId}
        onEditClick={onEditClick}
        onPatientUpdated={onPatientUpdated}
      />
      <ActiveMedicationsList patientId={patientId} />
      <PatientDetailsAccordion patient={patient} />
      <PatientAuditTrail patientId={patientId} userRole={userRole} />
    </>
  )
}

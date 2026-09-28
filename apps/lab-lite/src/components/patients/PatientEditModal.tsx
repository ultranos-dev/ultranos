'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ModalHeader } from '@ultranos/ui-kit/components/ui/dialog'
import type { FhirPatient, FhirAllergyIntolerance } from '@ultranos/shared-types'
import type { AllergyEntry } from '@ultranos/patient-kit/components/registration/allergies-section'
import { PatientRegistrationForm } from '@/components/patients/PatientRegistrationForm'
import { loadPatientAllergies } from '@/lib/patient-clinical-store'

interface PatientEditModalProps {
  open: boolean
  patient: FhirPatient
  patientId: string
  onClose: () => void
  onSaved: (updated: FhirPatient) => void
}

/** Map a stored AllergyIntolerance to the registration form's allergy entry shape. */
function toAllergyEntry(a: FhirAllergyIntolerance): AllergyEntry {
  return {
    id: a.id,
    substanceText: a.code?.text ?? a._ultranos?.substanceFreeText ?? '',
    criticality: (a.criticality as AllergyEntry['criticality']) ?? 'unable-to-assess',
  }
}

/**
 * Edit Patient Profile — renders the shared PatientRegistrationForm (lab host wrapper)
 * in edit mode, pre-filled from this patient. Mirrors OPD-Lite exactly so create and
 * edit use the same modal + full form (nothing gated) and never diverge.
 */
export function PatientEditModal({
  open,
  patient,
  patientId,
  onClose,
  onSaved,
}: PatientEditModalProps) {
  const t = useTranslations('registration')
  const [existingAllergies, setExistingAllergies] = useState<AllergyEntry[] | null>(null)

  useEffect(() => {
    if (!open) {
      setExistingAllergies(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const list = await loadPatientAllergies(patientId)
      if (!cancelled) setExistingAllergies(list.map(toAllergyEntry))
    })()
    return () => {
      cancelled = true
    }
  }, [open, patientId])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-patient-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          title={t('editPatientProfile')}
          titleId="edit-patient-title"
          onClose={onClose}
          closeLabel={t('close')}
          className="rounded-t-xl"
        />
        <div className="flex-1 overflow-y-auto p-4">
          {existingAllergies === null ? (
            <div className="flex min-h-[8rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
              {t('submitting')}
            </div>
          ) : (
            <PatientRegistrationForm
              editContext={{
                patientId,
                patient,
                existingAllergies,
                lastKnownUpdate: patient.meta.lastUpdated,
                onSaved: (updated) => { onSaved(updated); onClose() },
                onCancel: onClose,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

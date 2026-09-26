'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ModalHeader } from '@ultranos/ui-kit/components/ui/dialog'
import type { FhirPatient, FhirAllergyIntolerance } from '@ultranos/shared-types'
import {
  PatientRegistrationForm,
} from '@/components/registration/PatientRegistrationForm'
import type { AllergyEntry } from '@/components/registration/AllergiesSection'
import { fetchPatientAllergiesFromHub } from '@/lib/trpc'

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
 * Edit Patient Profile — renders the shared PatientRegistrationForm in edit mode,
 * pre-filled from this patient. Every field the registration page captures is
 * editable here; on save the form runs patient.update + an append-only allergy
 * diff + an optional point-of-care consent capture (see PatientRegistrationForm).
 *
 * This modal only fetches the patient's current allergies (for the allergy
 * section's pre-fill) and hosts the form; all form/submit logic lives in the
 * shared component so this can never drift from the register page.
 */
export function PatientEditModal({
  open,
  patient,
  patientId,
  onClose,
  onSaved,
}: PatientEditModalProps) {
  const t = useTranslations('registration')
  // null = still loading; an array (possibly empty) = ready to render the form.
  const [existingAllergies, setExistingAllergies] = useState<AllergyEntry[] | null>(null)

  // Load the patient's active allergies when the modal opens (for prefill).
  useEffect(() => {
    if (!open) {
      setExistingAllergies(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchPatientAllergiesFromHub(patientId)
        const active = (list ?? []).filter(
          (a) => a.clinicalStatus?.coding?.[0]?.code === 'active',
        )
        if (!cancelled) setExistingAllergies(active.map(toAllergyEntry))
      } catch {
        // Hub unreachable — proceed with an empty allergy list (edit still works).
        if (!cancelled) setExistingAllergies([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, patientId])

  // Escape closes the modal.
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
                onSaved,
                onCancel: onClose,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

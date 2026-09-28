'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { ModalHeader } from '@ultranos/ui-kit/components/ui/dialog'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

interface PatientCreateModalProps {
  open: boolean
  /** Optional given-name prefill (e.g. from a "not found → register" search). */
  prefilledNameGiven?: string
  onClose: () => void
}

/**
 * Register-new-patient as a modal — hosts the shared PatientRegistrationForm (pharmacy
 * host wrapper) in create mode. Mirrors OPD-Lite exactly so create and edit use the same
 * modal + form and never diverge across apps. Cancel / Escape / backdrop close the modal.
 */
export function PatientCreateModal({ open, prefilledNameGiven = '', onClose }: PatientCreateModalProps) {
  const t = useTranslations('registration')

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
      aria-labelledby="register-patient-title"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-xl bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader
          title={t('title')}
          titleId="register-patient-title"
          onClose={onClose}
          closeLabel={t('close')}
          className="rounded-t-xl"
        />
        <div className="flex-1 overflow-y-auto p-4">
          <PatientRegistrationForm prefilledNameGiven={prefilledNameGiven} onCancel={onClose} />
        </div>
      </div>
    </div>
  )
}

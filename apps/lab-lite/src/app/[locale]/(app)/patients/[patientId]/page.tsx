'use client'

import { useTranslations } from 'next-intl'
import { use } from 'react'
import { DelegateManagementSection } from '@/components/consent/DelegateManagementSection'

interface PatientProfilePageProps {
  params: Promise<{ patientId: string }>
}

/**
 * Patient profile page — shows family delegate management for a patient.
 *
 * Route: /patients/[patientId]  where patientId is the UUID part of Patient/<uuid>.
 * Constructs the full FHIR reference internally — never exposed in the URL.
 *
 * Entry points:
 *  - After consent capture (consent page → "Add Delegate" → here)
 *  - From any workflow that has a patientRef and needs delegate management (Task 3.1, 3.3)
 */
export default function PatientProfilePage({ params }: PatientProfilePageProps) {
  const { patientId } = use(params)
  const t = useTranslations('patients')

  // Reconstruct the FHIR reference — never store the full ref in the URL
  const patientRef = `Patient/${patientId}`

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-foreground">{t('profileTitle')}</h1>
      <DelegateManagementSection patientRef={patientRef} />
    </div>
  )
}

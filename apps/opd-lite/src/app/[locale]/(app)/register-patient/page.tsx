'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('registration')
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      <div className="px-6 pb-6 max-w-3xl">
        <PatientRegistrationForm prefilledNameGiven={prefilledName} />
      </div>
    </div>
  )
}

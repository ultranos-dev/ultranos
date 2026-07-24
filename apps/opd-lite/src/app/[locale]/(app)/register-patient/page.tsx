'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('registration')
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <PatientRegistrationForm prefilledNameGiven={prefilledName} />
    </div>
  )
}

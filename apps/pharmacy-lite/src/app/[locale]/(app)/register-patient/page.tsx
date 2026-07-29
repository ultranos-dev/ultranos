'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const searchParams = useSearchParams()
  const t = useTranslations('registration')
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('registerNew')}</h1>
      <PatientRegistrationForm prefilledNameGiven={prefilledName} />
    </div>
  )
}

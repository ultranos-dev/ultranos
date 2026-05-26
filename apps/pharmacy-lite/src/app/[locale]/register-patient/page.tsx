'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('registration')
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-bold text-neutral-900 mb-8">{t('title')}</h1>
      <PatientRegistrationForm prefilledNameGiven={prefilledName} />
    </div>
  )
}

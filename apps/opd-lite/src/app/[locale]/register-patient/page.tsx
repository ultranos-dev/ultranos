'use client'

import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('registration')
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <main id="main-content" className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('title')}</h1>
      <PatientRegistrationForm prefilledNameGiven={prefilledName} />
    </main>
  )
}

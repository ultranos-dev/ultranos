'use client'

import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/patients/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('patients')

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-xl font-bold text-foreground">{t('registerTitle')}</h1>
      <PatientRegistrationForm />
    </div>
  )
}

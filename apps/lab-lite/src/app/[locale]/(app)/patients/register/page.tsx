'use client'

import { useTranslations } from 'next-intl'
import { PatientRegistrationForm } from '@/components/patients/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const t = useTranslations('patients')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('registerTitle')}</h1>
      <PatientRegistrationForm />
    </div>
  )
}

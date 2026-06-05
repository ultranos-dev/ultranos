'use client'

import { useSearchParams } from 'next/navigation'
import { PatientRegistrationForm } from '@/components/registration/PatientRegistrationForm'

export default function RegisterPatientPage() {
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8">
      <PatientRegistrationForm prefilledNameGiven={prefilledName} />
    </div>
  )
}

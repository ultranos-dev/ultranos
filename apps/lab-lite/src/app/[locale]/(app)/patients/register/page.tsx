'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PatientCreateModal } from '@/components/patients/PatientCreateModal'

/**
 * Thin host route for the register-new-patient modal. Kept so the nav link,
 * bookmarks, and the `?nameGiven=` deep-link still resolve to a real URL; the
 * actual UI is the shared PatientCreateModal (same full form as Edit Profile),
 * mirroring OPD-Lite. Closing the modal returns to the previous view.
 */
export default function RegisterPatientPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const prefilledName = searchParams.get('nameGiven') ?? ''

  return (
    <PatientCreateModal
      open
      prefilledNameGiven={prefilledName}
      onClose={() => router.back()}
    />
  )
}

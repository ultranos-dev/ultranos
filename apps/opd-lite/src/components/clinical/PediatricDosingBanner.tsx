import { Alert } from '@ultranos/ui-kit/components/ui/alert'
import { calculateAge } from '@/lib/clinical-utils'

interface PediatricDosingBannerProps {
  patientBirthDate: string
  birthYearOnly?: boolean
}

export function PediatricDosingBanner({ patientBirthDate, birthYearOnly }: PediatricDosingBannerProps) {
  if (birthYearOnly) return null

  const age = calculateAge(patientBirthDate)

  if (isNaN(age) || age >= 18) return null

  return (
    <Alert
      variant="warning"
      role="status"
      data-testid="pediatric-dosing-banner"
      dir="auto"
      className="mb-4"
    >
      Weight-based dosing not supported. Calculate manually.
    </Alert>
  )
}

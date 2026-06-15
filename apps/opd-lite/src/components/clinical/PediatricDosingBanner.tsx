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
    <div
      role="alert"
      data-testid="pediatric-dosing-banner"
      dir="auto"
      className="mb-4 rounded-lg border border-warning/40 bg-warning/20 py-3 ps-4 pe-4 font-semibold text-foreground"
    >
      Weight-based dosing not supported — calculate manually
    </div>
  )
}

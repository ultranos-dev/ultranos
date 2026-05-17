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
      className="mb-4 rounded-lg py-3 ps-4 pe-4 font-semibold"
      style={{ backgroundColor: '#ffd11a', color: '#0e0f0c' }}
    >
      Weight-based dosing not supported — calculate manually
    </div>
  )
}

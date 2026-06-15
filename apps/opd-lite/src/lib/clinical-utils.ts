// Re-export from shared package — canonical location is @ultranos/shared-types
export { calculateBMI } from '@ultranos/shared-types'

/**
 * Calculate age in years from an ISO 8601 birth date string.
 * Returns NaN if the date is unparseable.
 */
export function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return NaN
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age
}

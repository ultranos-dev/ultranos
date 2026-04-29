/**
 * Calculate BMI from weight (kg) and height (cm).
 * Returns null if inputs are invalid or zero.
 */
export function calculateBMI(
  weightKg: number,
  heightCm: number,
): number | null {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    weightKg <= 0 ||
    heightCm <= 0
  ) {
    return null
  }

  const heightM = heightCm / 100
  return weightKg / (heightM * heightM)
}

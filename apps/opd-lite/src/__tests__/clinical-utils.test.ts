import { describe, it, expect } from 'vitest'
import { calculateBMI } from '@/lib/clinical-utils'

describe('calculateBMI', () => {
  it('calculates BMI correctly for normal values', () => {
    // BMI = weight(kg) / (height(m))^2
    // 70kg, 175cm => 70 / (1.75)^2 = 70 / 3.0625 = 22.857...
    const result = calculateBMI(70, 175)
    expect(result).toBeCloseTo(22.86, 1)
  })

  it('returns null when weight is zero', () => {
    expect(calculateBMI(0, 175)).toBeNull()
  })

  it('returns null when height is zero', () => {
    expect(calculateBMI(70, 0)).toBeNull()
  })

  it('returns null when weight is negative', () => {
    expect(calculateBMI(-5, 175)).toBeNull()
  })

  it('returns null when height is negative', () => {
    expect(calculateBMI(70, -10)).toBeNull()
  })

  it('returns null when weight is NaN', () => {
    expect(calculateBMI(NaN, 175)).toBeNull()
  })

  it('returns null when height is NaN', () => {
    expect(calculateBMI(70, NaN)).toBeNull()
  })

  it('handles very small patients (pediatric)', () => {
    // 5kg, 50cm => 5 / (0.5)^2 = 5 / 0.25 = 20
    const result = calculateBMI(5, 50)
    expect(result).toBeCloseTo(20, 1)
  })

  it('handles obese values', () => {
    // 150kg, 170cm => 150 / (1.7)^2 = 150 / 2.89 = 51.9
    const result = calculateBMI(150, 170)
    expect(result).toBeCloseTo(51.9, 0)
  })
})

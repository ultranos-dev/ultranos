import { describe, it, expect } from 'vitest'
import { getVitalRangeStatus, vitalsConfig } from '@/lib/vitals-config'

describe('vitalsConfig', () => {
  it('defines thresholds for all vital signs including BMI', () => {
    expect(vitalsConfig.weight).toBeDefined()
    expect(vitalsConfig.height).toBeDefined()
    expect(vitalsConfig.systolic).toBeDefined()
    expect(vitalsConfig.diastolic).toBeDefined()
    expect(vitalsConfig.temperature).toBeDefined()
    expect(vitalsConfig.bmi).toBeDefined()
  })

  it('has warning and panic ranges for each vital', () => {
    for (const key of Object.keys(vitalsConfig)) {
      const config = vitalsConfig[key as keyof typeof vitalsConfig]
      expect(config).toHaveProperty('warningLow')
      expect(config).toHaveProperty('warningHigh')
      expect(config).toHaveProperty('panicLow')
      expect(config).toHaveProperty('panicHigh')
    }
  })
})

describe('getVitalRangeStatus', () => {
  it('returns "normal" for values in normal range', () => {
    expect(getVitalRangeStatus('temperature', 37.0)).toBe('normal')
    expect(getVitalRangeStatus('systolic', 120)).toBe('normal')
    expect(getVitalRangeStatus('diastolic', 80)).toBe('normal')
  })

  it('returns "warning" for mildly abnormal temperature', () => {
    // Temp > 38.5 warning threshold
    expect(getVitalRangeStatus('temperature', 38.6)).toBe('warning')
  })

  it('returns "panic" for severely abnormal temperature', () => {
    expect(getVitalRangeStatus('temperature', 42)).toBe('panic')
    expect(getVitalRangeStatus('temperature', 34)).toBe('panic')
  })

  it('returns "warning" for mildly high systolic BP', () => {
    expect(getVitalRangeStatus('systolic', 145)).toBe('warning')
  })

  it('returns "panic" for severely high systolic BP', () => {
    expect(getVitalRangeStatus('systolic', 185)).toBe('panic')
  })

  it('returns "warning" for low systolic BP', () => {
    expect(getVitalRangeStatus('systolic', 88)).toBe('warning')
  })

  it('returns "panic" for very low systolic BP', () => {
    expect(getVitalRangeStatus('systolic', 78)).toBe('panic')
  })

  it('returns "normal" for empty/NaN values', () => {
    expect(getVitalRangeStatus('temperature', NaN)).toBe('normal')
  })

  it('returns "warning" for low temperature', () => {
    expect(getVitalRangeStatus('temperature', 35.5)).toBe('warning')
  })

  it('returns "warning" for high diastolic BP', () => {
    expect(getVitalRangeStatus('diastolic', 95)).toBe('warning')
  })

  it('returns "panic" for very high diastolic BP', () => {
    expect(getVitalRangeStatus('diastolic', 125)).toBe('panic')
  })

  it('returns "normal" for normal BMI', () => {
    expect(getVitalRangeStatus('bmi', 22)).toBe('normal')
  })

  it('returns "warning" for overweight BMI', () => {
    expect(getVitalRangeStatus('bmi', 27)).toBe('warning')
  })

  it('returns "warning" for underweight BMI', () => {
    expect(getVitalRangeStatus('bmi', 17)).toBe('warning')
  })

  it('returns "panic" for obese BMI', () => {
    expect(getVitalRangeStatus('bmi', 42)).toBe('panic')
  })

  it('returns "panic" for severely underweight BMI', () => {
    expect(getVitalRangeStatus('bmi', 14)).toBe('panic')
  })
})

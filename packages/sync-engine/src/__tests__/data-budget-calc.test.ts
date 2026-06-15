import { describe, it, expect } from 'vitest'
import {
  getThresholdLevel,
  calculateProjectedExhaustion,
  getCycleStartDate,
  getCycleEndDate,
  isCycleBoundaryCrossed,
} from '../data-budget-calc.js'
import { categorizeUrl } from '../data-meter.js'

describe('getThresholdLevel', () => {
  it('returns normal below 75%', () => {
    expect(getThresholdLevel(300, 500)).toBe('normal')
  })
  it('returns warning at 75%', () => {
    expect(getThresholdLevel(375, 500)).toBe('warning')
  })
  it('returns critical at 90%', () => {
    expect(getThresholdLevel(450, 500)).toBe('critical')
  })
  it('returns normal when planSizeMB is 0', () => {
    expect(getThresholdLevel(100, 0)).toBe('normal')
  })
})

describe('calculateProjectedExhaustion', () => {
  it('returns null when avgDailyUsageMB is 0', () => {
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 100, avgDailyUsageMB: 0, cycleEndDate: '2026-06-30' })).toBeNull()
  })
  it('returns current date when already exhausted', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 600, avgDailyUsageMB: 10, cycleEndDate: '2026-06-30' })).toBe(today)
  })
  it('caps projection at cycle end date', () => {
    const cycleEndDate = '2026-06-30'
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 100, avgDailyUsageMB: 0.1, cycleEndDate })).toBe(cycleEndDate)
  })
})

describe('getCycleStartDate', () => {
  it('returns current month start if day has passed', () => {
    const ref = new Date('2026-06-15')
    expect(getCycleStartDate(1, ref)).toBe('2026-06-01')
  })
  it('returns previous month start if day has not arrived', () => {
    const ref = new Date('2026-06-05')
    expect(getCycleStartDate(10, ref)).toBe('2026-05-10')
  })
})

describe('isCycleBoundaryCrossed', () => {
  it('returns false when still in same cycle', () => {
    expect(isCycleBoundaryCrossed('2026-06-01', 1, new Date('2026-06-15'))).toBe(false)
  })
  it('returns true when next cycle has started', () => {
    expect(isCycleBoundaryCrossed('2026-05-01', 1, new Date('2026-06-05'))).toBe(true)
  })
})

describe('categorizeUrl', () => {
  it('classifies audit endpoints as audit', () => {
    expect(categorizeUrl('https://hub/api/audit.sync')).toBe('audit')
    expect(categorizeUrl('https://hub/api/audit')).toBe('audit')
  })
  it('classifies upload/uploadResult as upload', () => {
    expect(categorizeUrl('https://hub/api/upload')).toBe('upload')
    expect(categorizeUrl('https://hub/api/uploadResult')).toBe('upload')
  })
  it('classifies sync.push endpoints as upload', () => {
    expect(categorizeUrl('https://hub/api/trpc/sync.push')).toBe('upload')
  })
  it('classifies recordDispense endpoints as upload', () => {
    expect(categorizeUrl('https://hub/medication.recordDispense')).toBe('upload')
  })
  it('classifies notification endpoints as notification', () => {
    expect(categorizeUrl('https://hub/api/notification')).toBe('notification')
  })
  it('falls back to other for unknown endpoints', () => {
    expect(categorizeUrl('https://hub/api/patients')).toBe('other')
  })
})

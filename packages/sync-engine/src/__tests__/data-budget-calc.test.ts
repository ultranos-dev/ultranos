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
  // Local-calendar YYYY-MM-DD, matching how the function serializes dates.
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  it('returns null when avgDailyUsageMB is 0', () => {
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 100, avgDailyUsageMB: 0, cycleEndDate: '2026-06-30' })).toBeNull()
  })
  it('returns current date when already exhausted', () => {
    const today = ymd(new Date())
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 600, avgDailyUsageMB: 10, cycleEndDate: today })).toBe(today)
  })
  it('caps projection at cycle end date when the rate would run past it', () => {
    const future = new Date()
    future.setDate(future.getDate() + 5)
    const cycleEndDate = ymd(future)
    // Slow burn: at this rate the budget alone would last years, so the cycle end caps it.
    expect(calculateProjectedExhaustion({ planSizeMB: 500, usedMB: 100, avgDailyUsageMB: 0.1, cycleEndDate })).toBe(cycleEndDate)
  })
  it('never projects a date before today when the cycle end is already in the past', () => {
    const today = ymd(new Date())
    expect(
      calculateProjectedExhaustion({ planSizeMB: 1000, usedMB: 950, avgDailyUsageMB: 135, cycleEndDate: '2020-01-01' }),
    ).toBe(today)
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
  it('uses the local calendar day, not a UTC-shifted one', () => {
    // Reference built with local Y/M/D so the assertion is timezone-independent.
    expect(getCycleStartDate(15, new Date(2026, 6, 20))).toBe('2026-07-15')
  })
})

describe('getCycleEndDate', () => {
  it('ends a monthly cycle on the last day of the start month', () => {
    // Cycle day 1 starting 2026-07-01 → next cycle 2026-08-01 → ends 2026-07-31.
    expect(getCycleEndDate(1, '2026-07-01')).toBe('2026-07-31')
  })
  it('handles a mid-month cycle day', () => {
    // Cycle day 15 starting 2026-07-15 → next cycle 2026-08-15 → ends 2026-08-14.
    expect(getCycleEndDate(15, '2026-07-15')).toBe('2026-08-14')
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

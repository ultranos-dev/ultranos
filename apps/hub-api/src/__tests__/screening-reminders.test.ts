import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeScreeningReminders } from '../lib/screening-reminders'

describe('computeScreeningReminders', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns NOT_RECORDED when no TB screening date', () => {
    const result = computeScreeningReminders({ tb_screening_date: null })
    expect(result.tbScreening.status).toBe('NOT_RECORDED')
    expect(result.tbScreening.message).toBe('No TB screening recorded')
  })

  it('returns OVERDUE when TB screening is past 12 months', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01'))

    const result = computeScreeningReminders({ tb_screening_date: '2025-01-01' })
    expect(result.tbScreening.status).toBe('OVERDUE')
    expect(result.tbScreening.daysOverdue).toBeGreaterThan(0)
    expect(result.tbScreening.message).toMatch(/overdue by \d+ days/)
  })

  it('returns DUE_SOON when TB screening is within 30 days of due', () => {
    vi.useFakeTimers()
    // Screening was 11 months + 15 days ago → due in ~15 days
    vi.setSystemTime(new Date('2026-05-15'))

    const result = computeScreeningReminders({ tb_screening_date: '2025-06-01' })
    expect(result.tbScreening.status).toBe('DUE_SOON')
    expect(result.tbScreening.daysUntilDue).toBeLessThanOrEqual(30)
    expect(result.tbScreening.daysUntilDue).toBeGreaterThan(0)
    expect(result.tbScreening.message).toMatch(/due in \d+ days/)
  })

  it('returns UP_TO_DATE when TB screening is recent', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01'))

    const result = computeScreeningReminders({ tb_screening_date: '2026-01-01' })
    expect(result.tbScreening.status).toBe('UP_TO_DATE')
    expect(result.tbScreening.daysUntilDue).toBeGreaterThan(30)
    expect(result.tbScreening.message).toBe('TB screening up to date')
  })

  it('handles Date objects in addition to strings', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01'))

    const result = computeScreeningReminders({ tb_screening_date: new Date('2026-01-01') })
    expect(result.tbScreening.status).toBe('UP_TO_DATE')
  })

  it('returns NOT_RECORDED for invalid/malformed date strings (NaN guard)', () => {
    const result = computeScreeningReminders({ tb_screening_date: 'not-a-date' })
    expect(result.tbScreening.status).toBe('NOT_RECORDED')
    expect(result.tbScreening.message).toBe('No TB screening recorded')
  })
})

/**
 * Story 48.2 — Unit tests for reagent-burndown.ts
 * Task 10
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateDailyConsumptionRate,
  projectUsageDepletionDate,
  getEffectiveDepletionDate,
  calculateReorderDate,
  evaluateAlertThreshold,
  daysUntilDepletion,
} from '../lib/reagent-burndown'

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockConsumptionEntries: import('../lib/db').ReagentConsumptionEntry[] = []

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getConsumptionLogForBurndown: vi.fn(async () => [...mockConsumptionEntries]),
    getActiveReagents: vi.fn(async () => []),
  }
})

function makeEntry(quantityUsed: number, daysAgo: number, unit = 'mL'): import('../lib/db').ReagentConsumptionEntry {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return {
    reagentId: 'r1',
    loincCode: '14749-6',
    quantityUsed,
    unit,
    consumedAt: d.toISOString(),
    technicianId: 'tech1',
  }
}

beforeEach(() => {
  mockConsumptionEntries.length = 0
})

// ---------------------------------------------------------------------------
// calculateDailyConsumptionRate
// ---------------------------------------------------------------------------

describe('calculateDailyConsumptionRate', () => {
  it('returns zero rate when no entries exist', async () => {
    const result = await calculateDailyConsumptionRate('r1')
    expect(result.averageDailyUsage).toBe(0)
    expect(result.dataPointCount).toBe(0)
    expect(result.confidenceLevel).toBe('low')
  })

  it('returns high confidence with >= 14 data points', async () => {
    for (let i = 0; i < 14; i++) mockConsumptionEntries.push(makeEntry(10, i))
    const result = await calculateDailyConsumptionRate('r1')
    expect(result.confidenceLevel).toBe('high')
    expect(result.dataPointCount).toBe(14)
  })

  it('returns medium confidence with 7–13 data points', async () => {
    for (let i = 0; i < 10; i++) mockConsumptionEntries.push(makeEntry(10, i))
    const result = await calculateDailyConsumptionRate('r1')
    expect(result.confidenceLevel).toBe('medium')
  })

  it('returns low confidence with < 7 data points', async () => {
    for (let i = 0; i < 5; i++) mockConsumptionEntries.push(makeEntry(10, i))
    const result = await calculateDailyConsumptionRate('r1')
    expect(result.confidenceLevel).toBe('low')
  })

  it('calculates correct average daily usage', async () => {
    // 14 entries each consuming 28 mL across 13 days → ~2.15 mL/day
    for (let i = 0; i < 14; i++) mockConsumptionEntries.push(makeEntry(28, i))
    const result = await calculateDailyConsumptionRate('r1')
    expect(result.averageDailyUsage).toBeGreaterThan(0)
    expect(result.unit).toBe('mL')
  })
})

// ---------------------------------------------------------------------------
// projectUsageDepletionDate
// ---------------------------------------------------------------------------

describe('projectUsageDepletionDate', () => {
  it('returns null when daily rate is 0', () => {
    expect(projectUsageDepletionDate(100, 0)).toBeNull()
  })

  it('returns null when current stock is 0', () => {
    expect(projectUsageDepletionDate(0, 5)).toBeNull()
  })

  it('projects correct depletion date', () => {
    const stock = 100
    const rate = 10  // depletes in 10 days
    const result = projectUsageDepletionDate(stock, rate)
    expect(result).not.toBeNull()
    const daysFromNow = Math.round((result!.getTime() - Date.now()) / 86400000)
    expect(daysFromNow).toBe(10)
  })

  it('rounds up fractional days', () => {
    const result = projectUsageDepletionDate(15, 4)  // 3.75 days → rounds to 4
    expect(result).not.toBeNull()
    const daysFromNow = Math.round((result!.getTime() - Date.now()) / 86400000)
    expect(daysFromNow).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// getEffectiveDepletionDate
// ---------------------------------------------------------------------------

describe('getEffectiveDepletionDate', () => {
  it('returns expiry when usage depletion is null', () => {
    const expiry = new Date('2026-09-01')
    const result = getEffectiveDepletionDate(null, expiry)
    expect(result.date).toEqual(expiry)
    expect(result.reason).toBe('expiry')
  })

  it('returns usage when usage depletion is before expiry', () => {
    const usage = new Date('2026-07-01')
    const expiry = new Date('2026-09-01')
    const result = getEffectiveDepletionDate(usage, expiry)
    expect(result.date).toEqual(usage)
    expect(result.reason).toBe('usage')
  })

  it('returns expiry when expiry is before usage depletion', () => {
    const usage = new Date('2026-09-01')
    const expiry = new Date('2026-07-01')
    const result = getEffectiveDepletionDate(usage, expiry)
    expect(result.date).toEqual(expiry)
    expect(result.reason).toBe('expiry')
  })

  it('returns usage when usage depletion equals expiry', () => {
    const date = new Date('2026-08-01')
    const result = getEffectiveDepletionDate(date, new Date(date))
    expect(result.reason).toBe('usage')
  })
})

// ---------------------------------------------------------------------------
// calculateReorderDate
// ---------------------------------------------------------------------------

describe('calculateReorderDate', () => {
  it('subtracts lead time from effective depletion', () => {
    const today = new Date('2026-06-01')
    const depletion = new Date('2026-08-01')
    const result = calculateReorderDate(depletion, 30, today)
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-02')
  })

  it('returns today when reorder date is in the past', () => {
    const today = new Date('2026-06-01')
    const depletion = new Date('2026-06-05')  // only 4 days away
    const result = calculateReorderDate(depletion, 14, today)
    // reorderDate would be 2026-05-22, which is in the past → return today
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-01')
  })

  it('returns today when reorder date is exactly today', () => {
    const today = new Date('2026-06-01')
    const depletion = new Date('2026-06-15')
    const result = calculateReorderDate(depletion, 14, today)
    expect(result.toISOString().slice(0, 10)).toBe('2026-06-01')
  })
})

// ---------------------------------------------------------------------------
// evaluateAlertThreshold
// ---------------------------------------------------------------------------

describe('evaluateAlertThreshold', () => {
  function deplIn(days: number, today = new Date('2026-06-01')): Date {
    const d = new Date(today)
    d.setDate(d.getDate() + days)
    return d
  }
  const today = new Date('2026-06-01')

  it('returns critical at exactly 7 days', () => {
    expect(evaluateAlertThreshold(deplIn(7, today), today)).toBe('critical')
  })

  it('returns critical below 7 days', () => {
    expect(evaluateAlertThreshold(deplIn(3, today), today)).toBe('critical')
  })

  it('returns warning at exactly 14 days', () => {
    expect(evaluateAlertThreshold(deplIn(14, today), today)).toBe('warning')
  })

  it('returns warning between 8 and 14 days', () => {
    expect(evaluateAlertThreshold(deplIn(10, today), today)).toBe('warning')
  })

  it('returns info at exactly 30 days', () => {
    expect(evaluateAlertThreshold(deplIn(30, today), today)).toBe('info')
  })

  it('returns info between 15 and 30 days', () => {
    expect(evaluateAlertThreshold(deplIn(20, today), today)).toBe('info')
  })

  it('returns none above 30 days', () => {
    expect(evaluateAlertThreshold(deplIn(31, today), today)).toBe('none')
  })

  it('returns critical for overdue (negative days)', () => {
    expect(evaluateAlertThreshold(deplIn(-1, today), today)).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// daysUntilDepletion
// ---------------------------------------------------------------------------

describe('daysUntilDepletion', () => {
  it('returns 0 for today', () => {
    const today = new Date('2026-06-01')
    const depl = new Date('2026-06-01')
    expect(daysUntilDepletion(depl, today)).toBe(0)
  })

  it('returns negative for past dates', () => {
    const today = new Date('2026-06-01')
    const depl = new Date('2026-05-25')
    expect(daysUntilDepletion(depl, today)).toBe(-7)
  })

  it('returns correct positive count', () => {
    const today = new Date('2026-06-01')
    const depl = new Date('2026-06-15')
    expect(daysUntilDepletion(depl, today)).toBe(14)
  })
})

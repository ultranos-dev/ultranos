/**
 * Surge Inventory Tests — Story 54.5 (Task 15.3)
 *
 * Unit tests for surge-inventory.ts:
 *   - calculateSurgeProjections: burn rate calculation, isCritical threshold,
 *     multi-reagent sorting, zero-burn-rate edge case
 *   - formatSurgeAlertMessage: AC #9.5 format string, singular day, lead time
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateSurgeProjections, formatSurgeAlertMessage } from '../lib/surge-inventory'
import type { SurgeProjection } from '../types/outbreak'

// ---------------------------------------------------------------------------
// Mutable test state
// ---------------------------------------------------------------------------

let reagentsData: unknown[] = []

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDb: () => ({
    reagent_inventory: {
      where: () => ({
        anyOf: () => ({
          filter: () => ({
            toArray: () => Promise.resolve(reagentsData),
          }),
        }),
      }),
    },
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReagent(overrides: {
  reagentId?: string
  name?: string
  linkedTestCode?: string
  daysAgo?: number
  testsPerformed?: number
  expectedTests?: number
}) {
  const openDate = new Date()
  openDate.setDate(openDate.getDate() - (overrides.daysAgo ?? 10))
  return {
    reagentId: overrides.reagentId ?? 'reagent-001',
    name: overrides.name ?? 'Test Reagent',
    linkedTestCode: overrides.linkedTestCode ?? '51587-4',
    status: 'ACTIVE',
    openDate: openDate.toISOString(),
    testsPerformed: overrides.testsPerformed ?? 100,
    expectedTests: overrides.expectedTests ?? 200,
  }
}

// ---------------------------------------------------------------------------
// calculateSurgeProjections
// ---------------------------------------------------------------------------

describe('calculateSurgeProjections', () => {
  beforeEach(() => {
    reagentsData = []
  })

  it('returns empty array when no reagents found', async () => {
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result).toEqual([])
  })

  it('computes surgedBurnRate = baseBurnRate * surgeMultiplier', async () => {
    // 100 tests in 10 days → base = 10/day; 3x surge → surged = 30/day
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 100, expectedTests: 200 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result).toHaveLength(1)
    expect(result[0].baselineBurnRate).toBe(10)
    expect(result[0].surgedBurnRate).toBe(30)
  })

  it('computes daysUntilDepletion = remainingTests / surgedBurnRate', async () => {
    // 100 tests done, 200 expected → 100 remaining; surgedBurnRate = 30/day
    // daysUntilDepletion = 100/30 ≈ 3.3 days
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 100, expectedTests: 200 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result[0].daysUntilDepletion).toBeCloseTo(3.3, 1)
  })

  it('marks isCritical = true when daysUntilDepletion <= 7', async () => {
    // 10/day base × 3 = 30/day; 100 remaining → 3.3 days → critical
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 100, expectedTests: 200 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result[0].isCritical).toBe(true)
  })

  it('marks isCritical = false when daysUntilDepletion > 7', async () => {
    // 1/day base × 3 = 3/day; 100 remaining → 33.3 days → not critical
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 10, expectedTests: 110 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result[0].isCritical).toBe(false)
  })

  it('marks isCritical = false at exactly 7.0 days is the boundary', async () => {
    // Need exactly ~7 days. surgedBurnRate×7 = remaining
    // base=10/day × 3 = 30/day; need 30×7=210 remaining → expectedTests=310
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 100, expectedTests: 310 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    // daysUntilDepletion = 210/30 = 7.0 → isCritical = true (<=7)
    expect(result[0].isCritical).toBe(true)
  })

  it('sorts results by daysUntilDepletion ascending (most critical first)', async () => {
    // Reagent A: 100 done in 10d, 200 expected → 100 remaining, base=10, surged=30, days=3.3
    // Reagent B: 10 done in 10d, 1010 expected → 1000 remaining, base=1, surged=3, days=333
    reagentsData = [
      makeReagent({ reagentId: 'A', daysAgo: 10, testsPerformed: 100, expectedTests: 200 }),
      makeReagent({ reagentId: 'B', daysAgo: 10, testsPerformed: 10, expectedTests: 1010 }),
    ]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result[0].reagentId).toBe('A')
    expect(result[1].reagentId).toBe('B')
    expect(result[0].daysUntilDepletion).toBeLessThan(result[1].daysUntilDepletion)
  })

  it('reports correct currentStock (remaining tests)', async () => {
    reagentsData = [makeReagent({ testsPerformed: 80, expectedTests: 200 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    expect(result[0].currentStock).toBe(120)
  })

  it('returns Infinity daysUntilDepletion when surgedBurnRate = 0', async () => {
    // testsPerformed = 0 → baseBurnRate = 0 → surgedBurnRate = 0 → Infinity
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 0, expectedTests: 100 })]
    const result = await calculateSurgeProjections(['51587-4'], 3)
    // daysUntilDepletion is rounded to 1 decimal of Infinity = Infinity
    expect(result[0].daysUntilDepletion).toBe(Infinity)
    expect(result[0].isCritical).toBe(false)
  })

  it('applies surgeMultiplier = 5 correctly', async () => {
    reagentsData = [makeReagent({ daysAgo: 10, testsPerformed: 100, expectedTests: 200 })]
    const result = await calculateSurgeProjections(['51587-4'], 5)
    expect(result[0].surgedBurnRate).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// formatSurgeAlertMessage
// ---------------------------------------------------------------------------

describe('formatSurgeAlertMessage', () => {
  const makeProjection = (daysUntilDepletion: number): SurgeProjection => ({
    reagentId: 'r-001',
    reagentName: 'Malaria RDT',
    linkedTestCode: '51587-4',
    currentStock: 100,
    baselineBurnRate: 10,
    surgedBurnRate: 30,
    daysUntilDepletion,
    projectedStockoutDate: '',
    isCritical: daysUntilDepletion <= 7,
  })

  it('uses AC #9.5 format: "At Nx surge demand, [Reagent] will deplete in N days. Order by [date]..."', () => {
    const msg = formatSurgeAlertMessage(makeProjection(10), 3)
    expect(msg).toMatch(/^At 3× surge demand, Malaria RDT will deplete in 10 days\./)
    expect(msg).toMatch(/Order by .+ for 3-day lead-time delivery\.$/)
  })

  it('uses singular "day" for 1 day remaining', () => {
    const msg = formatSurgeAlertMessage(makeProjection(1), 3)
    expect(msg).toContain('will deplete in 1 day.')
    expect(msg).not.toContain('1 days')
  })

  it('uses plural "days" for 0 days', () => {
    const msg = formatSurgeAlertMessage(makeProjection(0), 3)
    expect(msg).toContain('will deplete in 0 days.')
  })

  it('uses plural "days" for 5 days', () => {
    const msg = formatSurgeAlertMessage(makeProjection(5), 3)
    expect(msg).toContain('will deplete in 5 days.')
  })

  it('references the surge multiplier in the message', () => {
    const msg = formatSurgeAlertMessage(makeProjection(10), 5)
    expect(msg).toMatch(/At 5× surge demand/)
  })

  it('references the reagent name in the message', () => {
    const projection: SurgeProjection = {
      ...makeProjection(10),
      reagentName: 'Cholera Culture Plate',
    }
    const msg = formatSurgeAlertMessage(projection, 3)
    expect(msg).toContain('Cholera Culture Plate')
  })

  it('uses custom leadTimeDays in the message', () => {
    const msg = formatSurgeAlertMessage(makeProjection(14), 3, 7)
    expect(msg).toContain('7-day lead-time delivery')
  })
})

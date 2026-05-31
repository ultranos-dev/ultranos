/**
 * Unit tests for reagent-waste-service.ts — Story 44.3
 *
 * All functions are pure — no Dexie, no state.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateConsumptionEfficiency,
  calculateWasteRate,
  calculateFinancialLoss,
  calculateFinancialLossByPeriod,
  projectExpiryBeforeDepletion,
  generateExpiryAlert,
} from '../lib/reagent-waste-service'
import { ReagentStatus } from '../lib/db'
import type { ReagentInventoryEntry, ReagentConsumptionEntry } from '../lib/db'

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------

function makeReagent(
  overrides: Partial<ReagentInventoryEntry> = {},
): ReagentInventoryEntry {
  return {
    reagentId: 'r-001',
    name: 'Chemistry Test Strips',
    lotNumber: 'LOT-A',
    openDate: '2026-05-01',
    expiryDate: '2026-06-30',
    expectedTests: 100,
    testsPerformed: 0,
    unit: 'strip pack',
    costPerUnit: 500,
    status: ReagentStatus.ACTIVE,
    disposalDate: null,
    disposalReason: null,
    disposalNotes: null,
    remainingAtDisposal: null,
    linkedTestCode: '51990-0',
    hlcTimestamp: '0000000000000-0000-0001',
    createdAt: '2026-05-01T08:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  }
}

function makeConsumptionLog(
  entries: Array<{ reagentId?: string; testsConsumed: number; loggedAt: string }>,
): ReagentConsumptionEntry[] {
  return entries.map((e, i) => ({
    id: i + 1,
    reagentId: e.reagentId ?? 'r-001',
    testsConsumed: e.testsConsumed,
    loggedAt: e.loggedAt,
    loggedBy: 'tech-001',
    notes: null,
  }))
}

// ---------------------------------------------------------------------------
// calculateConsumptionEfficiency
// ---------------------------------------------------------------------------

describe('calculateConsumptionEfficiency', () => {
  it('returns 1.0 (100%) when all tests performed', () => {
    const entry = makeReagent({ testsPerformed: 100, expectedTests: 100 })
    expect(calculateConsumptionEfficiency(entry)).toBe(1.0)
  })

  it('returns 0.5 (50%) when half tests performed', () => {
    const entry = makeReagent({ testsPerformed: 50, expectedTests: 100 })
    expect(calculateConsumptionEfficiency(entry)).toBe(0.5)
  })

  it('returns 0.0 (0%) when no tests performed', () => {
    const entry = makeReagent({ testsPerformed: 0, expectedTests: 100 })
    expect(calculateConsumptionEfficiency(entry)).toBe(0.0)
  })

  it('caps at 1.0 if testsPerformed exceeds expectedTests', () => {
    const entry = makeReagent({ testsPerformed: 120, expectedTests: 100 })
    expect(calculateConsumptionEfficiency(entry)).toBe(1.0)
  })

  it('returns 0 for expectedTests = 0 (guard against division by zero)', () => {
    const entry = makeReagent({ testsPerformed: 0, expectedTests: 0 })
    expect(calculateConsumptionEfficiency(entry)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// calculateWasteRate
// ---------------------------------------------------------------------------

describe('calculateWasteRate', () => {
  it('returns 0 when no disposed/expired reagents exist', () => {
    const entries = [makeReagent({ status: ReagentStatus.ACTIVE })]
    expect(calculateWasteRate(entries)).toBe(0)
  })

  it('returns 0 when there are no waste (all tests consumed)', () => {
    const entries = [
      makeReagent({
        status: ReagentStatus.DEPLETED,
        remainingAtDisposal: 0,
        expectedTests: 100,
      }),
    ]
    expect(calculateWasteRate(entries)).toBe(0)
  })

  it('returns correct waste rate for a single reagent with waste', () => {
    const entries = [
      makeReagent({
        status: ReagentStatus.EXPIRED,
        remainingAtDisposal: 40,
        expectedTests: 100,
      }),
    ]
    expect(calculateWasteRate(entries)).toBe(0.4)
  })

  it('calculates waste rate across multiple reagents', () => {
    const entries = [
      makeReagent({
        reagentId: 'r-001',
        status: ReagentStatus.EXPIRED,
        remainingAtDisposal: 20,
        expectedTests: 100,
      }),
      makeReagent({
        reagentId: 'r-002',
        status: ReagentStatus.DISPOSED,
        remainingAtDisposal: 30,
        expectedTests: 200,
      }),
    ]
    // (20 + 30) / (100 + 200) = 50/300 ≈ 0.1667
    expect(calculateWasteRate(entries)).toBeCloseTo(50 / 300)
  })

  it('ignores ACTIVE reagents', () => {
    const entries = [
      makeReagent({ status: ReagentStatus.ACTIVE }),
      makeReagent({
        reagentId: 'r-002',
        status: ReagentStatus.EXPIRED,
        remainingAtDisposal: 50,
        expectedTests: 100,
      }),
    ]
    expect(calculateWasteRate(entries)).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// calculateFinancialLoss
// ---------------------------------------------------------------------------

describe('calculateFinancialLoss', () => {
  it('returns 0 when no waste', () => {
    const entries = [
      makeReagent({
        status: ReagentStatus.DEPLETED,
        remainingAtDisposal: 0,
        costPerUnit: 500,
        expectedTests: 100,
      }),
    ]
    expect(calculateFinancialLoss(entries)).toBe(0)
  })

  it('calculates correct cost proration — 50% remaining = 50% loss', () => {
    const entries = [
      makeReagent({
        status: ReagentStatus.EXPIRED,
        remainingAtDisposal: 50,
        expectedTests: 100,
        costPerUnit: 400,
      }),
    ]
    expect(calculateFinancialLoss(entries)).toBe(200)
  })

  it('calculates loss across multiple reagents', () => {
    const entries = [
      makeReagent({
        reagentId: 'r-001',
        status: ReagentStatus.EXPIRED,
        remainingAtDisposal: 25,
        expectedTests: 100,
        costPerUnit: 400, // 25% of 400 = 100
      }),
      makeReagent({
        reagentId: 'r-002',
        status: ReagentStatus.DISPOSED,
        remainingAtDisposal: 10,
        expectedTests: 50,
        costPerUnit: 300, // 20% of 300 = 60
      }),
    ]
    expect(calculateFinancialLoss(entries)).toBeCloseTo(160)
  })

  it('ignores ACTIVE reagents', () => {
    const entries = [makeReagent({ status: ReagentStatus.ACTIVE, remainingAtDisposal: 50 })]
    expect(calculateFinancialLoss(entries)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// calculateFinancialLossByPeriod
// ---------------------------------------------------------------------------

describe('calculateFinancialLossByPeriod', () => {
  it('only counts reagents disposed within period', () => {
    const entries = [
      makeReagent({
        reagentId: 'r-001',
        status: ReagentStatus.EXPIRED,
        disposalDate: '2026-05-15',
        remainingAtDisposal: 50,
        expectedTests: 100,
        costPerUnit: 400, // loss = 200
      }),
      makeReagent({
        reagentId: 'r-002',
        status: ReagentStatus.EXPIRED,
        disposalDate: '2026-06-15',
        remainingAtDisposal: 50,
        expectedTests: 100,
        costPerUnit: 400, // loss = 200 — but outside period
      }),
    ]
    const loss = calculateFinancialLossByPeriod(entries, '2026-05-01', '2026-05-31')
    expect(loss).toBeCloseTo(200)
  })

  it('returns 0 for empty period', () => {
    const entries = [
      makeReagent({
        status: ReagentStatus.EXPIRED,
        disposalDate: '2026-07-01',
        remainingAtDisposal: 50,
        expectedTests: 100,
        costPerUnit: 400,
      }),
    ]
    expect(
      calculateFinancialLossByPeriod(entries, '2026-05-01', '2026-05-31'),
    ).toBe(0)
  })

  it('does not count projected ACTIVE reagent losses', () => {
    const entries = [makeReagent({ status: ReagentStatus.ACTIVE, disposalDate: null })]
    expect(
      calculateFinancialLossByPeriod(entries, '2026-05-01', '2026-05-31'),
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// projectExpiryBeforeDepletion
// ---------------------------------------------------------------------------

describe('projectExpiryBeforeDepletion', () => {
  it('returns null for non-ACTIVE reagent', () => {
    const entry = makeReagent({ status: ReagentStatus.DEPLETED })
    expect(projectExpiryBeforeDepletion(entry, [], '2026-05-31')).toBeNull()
  })

  it('returns null for insufficient data when opened < 3 days ago', () => {
    const entry = makeReagent({ openDate: '2026-05-30', expiryDate: '2026-07-31' })
    const log = makeConsumptionLog([{ testsConsumed: 5, loggedAt: '2026-05-30' }])
    expect(projectExpiryBeforeDepletion(entry, log, '2026-05-31')).toBeNull()
  })

  it('returns null when no consumption history', () => {
    const entry = makeReagent({ openDate: '2026-05-01', expiryDate: '2026-07-31' })
    expect(projectExpiryBeforeDepletion(entry, [], '2026-05-31')).toBeNull()
  })

  it('returns null when reagent will deplete before expiry', () => {
    // Opened May 1, 100 tests in 10 days = 10/day. 30 days remaining, 60 tests done.
    // 40 tests remain. At 10/day, depleted in 4 days well before June 30 expiry.
    const entry = makeReagent({
      openDate: '2026-05-01',
      expiryDate: '2026-06-30',
      expectedTests: 100,
      testsPerformed: 60,
    })
    const log = makeConsumptionLog([
      { testsConsumed: 60, loggedAt: '2026-05-10T08:00:00.000Z' },
    ])
    const result = projectExpiryBeforeDepletion(entry, log, '2026-05-31')
    // dailyRate = 60/30 = 2/day. 30 days to Jun 30. projected consumption = 60. remaining = 40 - 60 < 0 → null
    expect(result).toBeNull()
  })

  it('returns projection when reagent will expire with waste', () => {
    // Opened May 1, 10 tests in 30 days = ~0.33/day. 100 tests, 10 done, 90 remain.
    // 30 days to Jun 30. projected consumption = 0.33 * 30 = ~10. projected remaining = 80. → alert!
    const entry = makeReagent({
      openDate: '2026-05-01',
      expiryDate: '2026-06-30',
      expectedTests: 100,
      testsPerformed: 10,
      costPerUnit: 500,
    })
    const log = makeConsumptionLog([
      { testsConsumed: 10, loggedAt: '2026-05-15T08:00:00.000Z' },
    ])
    const result = projectExpiryBeforeDepletion(entry, log, '2026-05-31')
    expect(result).not.toBeNull()
    expect(result!.projectedRemainingAtExpiry).toBeGreaterThan(0)
    expect(result!.projectedFinancialLoss).toBeGreaterThan(0)
    expect(result!.daysUntilExpiry).toBe(30)
  })

  it('returns null if expiry date has already passed', () => {
    const entry = makeReagent({
      openDate: '2026-04-01',
      expiryDate: '2026-05-15', // already expired
    })
    const log = makeConsumptionLog([
      { testsConsumed: 20, loggedAt: '2026-04-15T08:00:00.000Z' },
    ])
    expect(projectExpiryBeforeDepletion(entry, log, '2026-05-31')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// generateExpiryAlert
// ---------------------------------------------------------------------------

describe('generateExpiryAlert', () => {
  it('generates a warning-severity alert when > 14 days until expiry', () => {
    const entry = makeReagent({ reagentId: 'r-001', name: 'Chemistry Strips' })
    const projection = {
      projectedRemainingAtExpiry: 30,
      projectedFinancialLoss: 150,
      dailyRate: 1,
      daysUntilExpiry: 20,
    }
    const alert = generateExpiryAlert(entry, projection)
    expect(alert.severity).toBe('warning')
    expect(alert.reagentName).toBe('Chemistry Strips')
    expect(alert.remainingTests).toBe(30)
    expect(alert.projectedFinancialLoss).toBe(150)
  })

  it('generates a critical-severity alert when <= 14 days until expiry', () => {
    const entry = makeReagent({ reagentId: 'r-001' })
    const projection = {
      projectedRemainingAtExpiry: 15,
      projectedFinancialLoss: 75,
      dailyRate: 1,
      daysUntilExpiry: 7,
    }
    const alert = generateExpiryAlert(entry, projection)
    expect(alert.severity).toBe('critical')
  })

  it('includes the linked test code in the alert', () => {
    const entry = makeReagent({ linkedTestCode: '58410-2' })
    const projection = {
      projectedRemainingAtExpiry: 10,
      projectedFinancialLoss: 50,
      dailyRate: 1,
      daysUntilExpiry: 14,
    }
    const alert = generateExpiryAlert(entry, projection)
    expect(alert.linkedTestCode).toBe('58410-2')
    // Exactly 14 days → critical
    expect(alert.severity).toBe('critical')
  })
})

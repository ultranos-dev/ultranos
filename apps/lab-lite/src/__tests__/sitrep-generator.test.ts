/**
 * Sitrep Generator Tests — Story 54.5 (Task 15.2)
 *
 * Unit tests for sitrep-generator.ts:
 *   - Positivity rate formula (Math.round(count/total * 1000) / 10)
 *   - Stockout projection (null when >30 days)
 *   - pendingSamples count
 *   - DailySitrep shape and persistence
 *   - Positive detection via interpretation codes and _ultranos extension
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateDailySitrep } from '../lib/sitrep-generator'
import type { OutbreakModeConfig } from '../types/outbreak'

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const TODAY = '2026-05-31'

const mockOutbreakConfig: OutbreakModeConfig = {
  id: 'outbreak-001',
  status: 'active',
  activatedBy: 'prac-001',
  activatedAt: '2026-05-31T08:00:00Z:0:test',
  deactivatedBy: null,
  deactivatedAt: null,
  targetPathogen: { code: 'MALARIA', display: 'Malaria' },
  targetTestCodes: ['51587-4'],
  affectedScope: ['loc-001'],
  activationReason: 'WHO alert',
  surgeMultiplier: 3,
  meta: { lastUpdated: '2026-05-31T08:00:00Z', versionId: '1' },
  _ultranos: {
    createdAt: '2026-05-31T08:00:00Z',
    hlcTimestamp: '2026-05-31T08:00:00Z:0:test',
  },
}

// ---------------------------------------------------------------------------
// Mutable test state (read by mock closures)
// ---------------------------------------------------------------------------

let labResultsData: unknown[] = []
let pendingSamplesData = 0
let reagentsData: unknown[] = []

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDb: () => ({
    lab_results: {
      where: () => ({
        anyOf: () => ({
          toArray: () => Promise.resolve(labResultsData),
        }),
      }),
    },
    samples: {
      filter: () => ({
        count: () => Promise.resolve(pendingSamplesData),
      }),
    },
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
  addDailySitrep: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => `${TODAY}T10:00:00Z:0:test`),
}))

vi.mock('uuid', () => ({ v4: vi.fn(() => 'sitrep-uuid-test') }))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import * as dbModule from '../lib/db'

describe('generateDailySitrep — shape and persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    labResultsData = []
    pendingSamplesData = 0
    reagentsData = []
    vi.mocked(dbModule.addDailySitrep).mockResolvedValue(undefined)
  })

  it('returns a DailySitrep with correct id, outbreakConfigId, reportDate, syncStatus', async () => {
    const sitrep = await generateDailySitrep(mockOutbreakConfig, {
      generatedBy: 'prac-001',
      reportDate: TODAY,
    })
    expect(sitrep.id).toBe('sitrep-uuid-test')
    expect(sitrep.outbreakConfigId).toBe('outbreak-001')
    expect(sitrep.reportDate).toBe(TODAY)
    expect(sitrep.generatedBy).toBe('prac-001')
    expect(sitrep.syncStatus).toBe('pending')
  })

  it('uses "system" as generatedBy when not specified', async () => {
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.generatedBy).toBe('system')
  })

  it('persists the sitrep via addDailySitrep', async () => {
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(vi.mocked(dbModule.addDailySitrep)).toHaveBeenCalledWith(sitrep)
    expect(vi.mocked(dbModule.addDailySitrep)).toHaveBeenCalledTimes(1)
  })
})

describe('generateDailySitrep — positivity rate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    labResultsData = []
    pendingSamplesData = 0
    reagentsData = []
    vi.mocked(dbModule.addDailySitrep).mockResolvedValue(undefined)
  })

  it('returns positivityRate = 0 when no tests performed', async () => {
    labResultsData = []
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.totalTestsPerformed).toBe(0)
    expect(sitrep.positiveCount).toBe(0)
    expect(sitrep.positivityRate).toBe(0)
  })

  it('computes 30.0% positivity for 3 positive out of 10', async () => {
    labResultsData = Array.from({ length: 10 }, (_, i) => ({
      loincCode: '51587-4',
      enteredAt: `${TODAY}T09:${String(i).padStart(2, '0')}:00Z`,
      interpretation:
        i < 3 ? [{ coding: [{ code: 'POS' }] }] : [],
    }))
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.totalTestsPerformed).toBe(10)
    expect(sitrep.positiveCount).toBe(3)
    expect(sitrep.positivityRate).toBe(30.0)
  })

  it('computes 14.3% positivity for 1 positive out of 7', async () => {
    labResultsData = Array.from({ length: 7 }, (_, i) => ({
      loincCode: '51587-4',
      enteredAt: `${TODAY}T09:0${i}:00Z`,
      interpretation:
        i === 0 ? [{ coding: [{ code: 'POSITIVE' }] }] : [],
    }))
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.positivityRate).toBe(14.3)
  })

  it('recognizes interpretation code "H" (high) as positive', async () => {
    labResultsData = [
      {
        loincCode: '51587-4',
        enteredAt: `${TODAY}T09:00:00Z`,
        interpretation: [{ coding: [{ code: 'H' }] }],
      },
    ]
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.positiveCount).toBe(1)
  })

  it('recognizes _ultranos.resultInterpretation = "POSITIVE" as positive', async () => {
    labResultsData = [
      {
        loincCode: '51587-4',
        enteredAt: `${TODAY}T09:00:00Z`,
        _ultranos: { resultInterpretation: 'POSITIVE' },
      },
    ]
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.positiveCount).toBe(1)
  })

  it('recognizes _ultranos.resultInterpretation = "ABNORMAL" as positive', async () => {
    labResultsData = [
      {
        loincCode: '51587-4',
        enteredAt: `${TODAY}T09:00:00Z`,
        _ultranos: { resultInterpretation: 'ABNORMAL' },
      },
    ]
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.positiveCount).toBe(1)
  })

  it('excludes results from previous days', async () => {
    labResultsData = [
      // Yesterday's positive — should NOT be counted
      {
        loincCode: '51587-4',
        enteredAt: '2026-05-30T23:59:00Z',
        interpretation: [{ coding: [{ code: 'POS' }] }],
      },
      // Today's negative
      { loincCode: '51587-4', enteredAt: `${TODAY}T09:00:00Z` },
    ]
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.totalTestsPerformed).toBe(1)
    expect(sitrep.positiveCount).toBe(0)
  })
})

describe('generateDailySitrep — pendingSamples', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    labResultsData = []
    reagentsData = []
    vi.mocked(dbModule.addDailySitrep).mockResolvedValue(undefined)
  })

  it('counts pendingSamples from db.samples.filter().count()', async () => {
    pendingSamplesData = 12
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.pendingSamples).toBe(12)
  })

  it('counts 0 when no pending samples', async () => {
    pendingSamplesData = 0
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.pendingSamples).toBe(0)
  })
})

describe('generateDailySitrep — reagent / stockout projection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    labResultsData = []
    pendingSamplesData = 0
    reagentsData = []
    vi.mocked(dbModule.addDailySitrep).mockResolvedValue(undefined)
  })

  it('returns null projectedStockoutDate when no reagents found', async () => {
    reagentsData = []
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.projectedStockoutDate).toBeNull()
    expect(sitrep.reagentBurnRate).toBe(0)
  })

  it('computes stockout date when reagent depletes within 30 days', async () => {
    // openDate = 10 days ago, 100 tests done, expectedTests=120 → 20 remaining
    // baseBurnRate = 100/10 = 10/day; surgedBurnRate = 30/day; days = 20/30 ≈ 0.67 → set date
    const openDate = new Date()
    openDate.setDate(openDate.getDate() - 10)
    reagentsData = [
      {
        reagentId: 'reagent-001',
        name: 'Malaria RDT',
        linkedTestCode: '51587-4',
        status: 'ACTIVE',
        openDate: openDate.toISOString(),
        testsPerformed: 100,
        expectedTests: 120,
      },
    ]
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.projectedStockoutDate).toBeTruthy()
    expect(sitrep.reagentBurnRate).toBeGreaterThan(0)
  })

  it('returns null projectedStockoutDate when stockout is > 30 days away', async () => {
    // openDate = 1 day ago, 10 tests done, expectedTests=1010 → 1000 remaining
    // baseBurnRate = 10/day; surgedBurnRate = 30/day; days = 1000/30 ≈ 33.3 → >30 → null
    const openDate = new Date()
    openDate.setDate(openDate.getDate() - 1)
    reagentsData = [
      {
        reagentId: 'reagent-002',
        name: 'Malaria RDT',
        linkedTestCode: '51587-4',
        status: 'ACTIVE',
        openDate: openDate.toISOString(),
        testsPerformed: 10,
        expectedTests: 1010,
      },
    ]
    const sitrep = await generateDailySitrep(mockOutbreakConfig, { reportDate: TODAY })
    expect(sitrep.projectedStockoutDate).toBeNull()
  })
})

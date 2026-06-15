/**
 * Story 52.2 — Redistribution Recommendation Engine: Unit Tests
 *
 * Tests:
 *  - Stockout detection and peer matching (AC 6)
 *  - Distance ranking with and without GPS (AC 6)
 *  - Transfer amount calculation: brings deficit lab to 14 days,
 *    does NOT drop source lab below 14 days (AC 6)
 *  - Same-district scoping — cross-district peers are ignored (AC 6)
 *
 * AC: 6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NetworkInventoryEntry } from '../lib/db'

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeEntry(
  labId: string,
  labName: string,
  district: string,
  items: Array<{
    reagentCode: string
    daysOfSupply: number
    currentQuantity: number
    dailyConsumptionRate: number
    isStockedOut: boolean
  }>,
  coordinates?: { lat: number; lng: number },
): NetworkInventoryEntry {
  return {
    id: undefined,
    labId,
    labName,
    district,
    province: 'Kabul',
    coordinates,
    snapshotAt: '2026-05-31T10:00:00Z',
    receivedAt: '2026-05-31T11:00:00Z',
    items: items.map(i => ({
      reagentCode: i.reagentCode,
      reagentDisplay: `Reagent ${i.reagentCode}`,
      category: 'hematology',
      currentQuantity: i.currentQuantity,
      unitOfMeasure: 'tests',
      dailyConsumptionRate: i.dailyConsumptionRate,
      daysOfSupply: i.daysOfSupply,
      expiryDate: '2027-01-01',
      lastRestockedAt: null,
      isStockedOut: i.isStockedOut,
    })),
  }
}

// ---------------------------------------------------------------------------
// Mock db — using a mutable closure for networkInventory data
// ---------------------------------------------------------------------------

let _networkInventoryData: NetworkInventoryEntry[] = []
const _storedRecommendations: any[] = []

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    networkInventory: {
      toArray: vi.fn(() => Promise.resolve(_networkInventoryData)),
    },
    redistributionRecommendations: {
      clear: vi.fn(() => Promise.resolve()),
      bulkAdd: vi.fn((recs: any[]) => {
        _storedRecommendations.length = 0
        recs.forEach((r, i) => _storedRecommendations.push({ ...r, id: i + 1 }))
        return Promise.resolve()
      }),
      toArray: vi.fn(() => Promise.resolve([..._storedRecommendations])),
    },
    transaction: vi.fn(async (_mode: string, _tables: any[], fn: () => Promise<void>) => {
      await fn()
    }),
  })),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeRedistributionRecommendations', () => {
  beforeEach(() => {
    _networkInventoryData = []
    _storedRecommendations.length = 0
    vi.clearAllMocks()
  })

  it('returns empty array when fewer than 2 labs have data', async () => {
    _networkInventoryData = [
      makeEntry('lab-a', 'Lab A', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 2, currentQuantity: 5, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-a')
    expect(result).toHaveLength(0)
  })

  it('generates a recommendation when deficit lab (≤7 days) and surplus lab (>30 days) exist in same district', async () => {
    _networkInventoryData = [
      makeEntry('lab-deficit', 'Deficit Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 3, currentQuantity: 6, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
      makeEntry('lab-surplus', 'Surplus Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 60, currentQuantity: 120, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-deficit')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.deficitLabId).toBe('lab-deficit')
    expect(result[0]!.sourceLabId).toBe('lab-surplus')
    expect(result[0]!.reagentCode).toBe('CBC')
  })

  it('does NOT generate a recommendation when surplus lab is in a different district', async () => {
    _networkInventoryData = [
      makeEntry('lab-deficit', 'Deficit Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 2, currentQuantity: 4, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
      makeEntry('lab-herat', 'Herat Lab', 'Herat', [   // different district
        { reagentCode: 'CBC', daysOfSupply: 60, currentQuantity: 120, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-deficit')
    expect(result).toHaveLength(0)
  })

  it('suggestedTransferQty brings deficit lab to ≥14 days without depleting source below 14', async () => {
    // Deficit: 3 days at 2/day (6 units). Needs 14×2=28 to reach target → needs 22 more.
    // Source: 60 days at 2/day (120 units). Min retain: 14×2=28. Can spare 120-28=92.
    // Expected: min(22, 92) = 22
    _networkInventoryData = [
      makeEntry('lab-deficit', 'Deficit Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 3, currentQuantity: 6, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
      makeEntry('lab-surplus', 'Surplus Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 60, currentQuantity: 120, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-deficit')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.suggestedTransferQty).toBe(22)

    // Post-transfer check: source lab remains ≥ 14 days
    const sourceRemaining = 120 - result[0]!.suggestedTransferQty
    expect(sourceRemaining / 2).toBeGreaterThanOrEqual(14)
  })

  it('caps transfer so source lab stays above 14 days when source has limited surplus', async () => {
    // Source: 32 days at 3/day (96 units). Min retain: 14×3=42. Can spare: 96-42=54.
    // Deficit: stockout at 5/day. Needs 14×5=70. Has 0 → needs 70 more.
    // Cap: min(70, 54) = 54 — source cannot give all 70 without going below 14 days.
    _networkInventoryData = [
      makeEntry('lab-deficit', 'Deficit Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 0, currentQuantity: 0, dailyConsumptionRate: 5, isStockedOut: true },
      ]),
      makeEntry('lab-moderate-source', 'Moderate Source Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 32, currentQuantity: 96, dailyConsumptionRate: 3, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-deficit')
    expect(result.length).toBeGreaterThan(0)

    // Verify suggested transfer does not drop source below 14 days
    const rec = result[0]!
    const sourceRemaining = 96 - rec.suggestedTransferQty
    const remainingDays = sourceRemaining / 3  // dailyRate = 3
    expect(remainingDays).toBeGreaterThanOrEqual(14)
    // Transfer is capped at 54 (not the full 70 needed)
    expect(rec.suggestedTransferQty).toBeLessThanOrEqual(54)
  })

  it('uses "same district" label when GPS coordinates unavailable', async () => {
    _networkInventoryData = [
      makeEntry('lab-deficit', 'Deficit Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 2, currentQuantity: 4, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
      makeEntry('lab-surplus', 'Surplus Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 60, currentQuantity: 120, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-deficit')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.distanceKm).toBeNull()
    expect(result[0]!.distanceLabel).toBe('same district')
  })

  it('generates km-based distance label when GPS coordinates available', async () => {
    _networkInventoryData = [
      makeEntry(
        'lab-deficit', 'Deficit Lab', 'Kabul',
        [{ reagentCode: 'CBC', daysOfSupply: 2, currentQuantity: 4, dailyConsumptionRate: 2, isStockedOut: false }],
        { lat: 34.5, lng: 69.2 },
      ),
      makeEntry(
        'lab-surplus', 'Surplus Lab', 'Kabul',
        [{ reagentCode: 'CBC', daysOfSupply: 60, currentQuantity: 120, dailyConsumptionRate: 2, isStockedOut: false }],
        { lat: 34.6, lng: 69.3 },  // ~13km away
      ),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-deficit')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.distanceKm).toBeTypeOf('number')
    expect(result[0]!.distanceKm).toBeGreaterThan(0)
    expect(result[0]!.distanceLabel).toMatch(/\d+ km/)
  })

  it('generates a recommendation for stocked-out reagent (isStockedOut=true)', async () => {
    _networkInventoryData = [
      makeEntry('lab-stockout', 'Stockout Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 0, currentQuantity: 0, dailyConsumptionRate: 2, isStockedOut: true },
      ]),
      makeEntry('lab-surplus', 'Surplus Lab', 'Kabul', [
        { reagentCode: 'CBC', daysOfSupply: 50, currentQuantity: 100, dailyConsumptionRate: 2, isStockedOut: false },
      ]),
    ]

    const { computeRedistributionRecommendations } = await import('../lib/inventory/redistribution-engine')
    const result = await computeRedistributionRecommendations('lab-stockout')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.deficitLabId).toBe('lab-stockout')
  })
})

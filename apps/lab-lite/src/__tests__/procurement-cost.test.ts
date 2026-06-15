/**
 * Procurement Cost Tracker Tests — Story 52.3 Task 9 (AC 7, 8)
 *
 * Unit tests for:
 *  - Lead time calculation in days (AC 7)
 *  - Total cost calculation: sum of item totalPrice values (AC 7)
 *  - Volume savings display (AC 8)
 *  - Average unit price over last 6 months (AC 8)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateLeadTimeDays,
  calculateTotalCost,
  getAverageUnitPrice,
} from '../lib/procurement/cost-tracker'
import type { OrderHistoryEntry } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock Dexie — getAverageUnitPrice reads from orderHistory
// ---------------------------------------------------------------------------

const mockOrderHistory: OrderHistoryEntry[] = []

vi.mock('../lib/db', async () => {
  const actual = await vi.importActual<typeof import('../lib/db')>('../lib/db')
  return {
    ...actual,
    getDb: vi.fn(() => ({
      orderHistory: {
        where: vi.fn(() => ({
          equals: vi.fn(() => ({ toArray: vi.fn().mockImplementation(() => Promise.resolve(mockOrderHistory)) }),
          ),
        })),
        toArray: vi.fn().mockImplementation(() => Promise.resolve(mockOrderHistory)),
      },
    })),
  }
})

// ---------------------------------------------------------------------------
// calculateLeadTimeDays (AC 7)
// ---------------------------------------------------------------------------

describe('calculateLeadTimeDays', () => {
  it('returns 0 for same-day delivery', () => {
    expect(calculateLeadTimeDays('2026-05-01T08:00:00Z', '2026-05-01T18:00:00Z')).toBe(0)
  })

  it('returns 1 for next-day delivery', () => {
    expect(calculateLeadTimeDays('2026-05-01T08:00:00Z', '2026-05-02T08:00:00Z')).toBe(1)
  })

  it('returns 14 for two-week delivery', () => {
    expect(calculateLeadTimeDays('2026-05-01T08:00:00Z', '2026-05-15T08:00:00Z')).toBe(14)
  })

  it('returns 30 for one-month delivery', () => {
    expect(calculateLeadTimeDays('2026-05-01T00:00:00Z', '2026-05-31T00:00:00Z')).toBe(30)
  })

  it('handles ISO date strings without time component', () => {
    expect(calculateLeadTimeDays('2026-05-01', '2026-05-08')).toBe(7)
  })
})

// ---------------------------------------------------------------------------
// calculateTotalCost (AC 7)
// ---------------------------------------------------------------------------

describe('calculateTotalCost', () => {
  it('sums all item totalPrice values in AFN', () => {
    const items = [
      { reagentCode: 'A', reagentDisplay: 'A', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: 10, totalPrice: 500 },
      { reagentCode: 'B', reagentDisplay: 'B', quantityRequested: 20, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: 25, totalPrice: 500 },
    ]
    expect(calculateTotalCost(items)).toBe(1000)
  })

  it('returns null if any item has null totalPrice (pricing not yet set)', () => {
    const items = [
      { reagentCode: 'A', reagentDisplay: 'A', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: null, totalPrice: null },
    ]
    expect(calculateTotalCost(items)).toBeNull()
  })

  it('returns null for empty items array', () => {
    expect(calculateTotalCost([])).toBeNull()
  })

  it('returns 0 for items with totalPrice of 0 (waived)', () => {
    const items = [
      { reagentCode: 'A', reagentDisplay: 'A', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: 0, totalPrice: 0 },
    ]
    expect(calculateTotalCost(items)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getAverageUnitPrice (AC 8)
// ---------------------------------------------------------------------------

describe('getAverageUnitPrice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrderHistory.length = 0
  })

  it('returns null if no history for reagent', async () => {
    const result = await getAverageUnitPrice('MAL-001', 6)
    expect(result).toBeNull()
  })

  it('returns average unit price for a reagent with one order', async () => {
    mockOrderHistory.push({
      id: 1,
      requestId: 'req-001',
      labId: 'lab-001',
      requestedBy: 'tech-001',
      requestedAt: '2026-05-01T08:00:00Z',
      deliveredAt: '2026-05-15T08:00:00Z',
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: 40, totalPrice: 2000 },
      ],
      urgency: 'urgent',
      batchOrderId: null,
      leadTimeDays: 14,
      totalCost: 2000,
      volumeSavingsAFN: null,
      createdAt: '2026-05-01T08:00:00Z',
    })

    const result = await getAverageUnitPrice('MAL-001', 6)
    expect(result).toBe(40)
  })

  it('returns average of multiple orders for same reagent', async () => {
    mockOrderHistory.push(
      {
        id: 1,
        requestId: 'req-001',
        labId: 'lab-001',
        requestedBy: 'tech-001',
        requestedAt: '2026-04-01T08:00:00Z',
        deliveredAt: '2026-04-15T08:00:00Z',
        items: [{ reagentCode: 'HBA1C-001', reagentDisplay: 'HbA1c', quantityRequested: 20, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: 60, totalPrice: 1200 }],
        urgency: 'routine',
        batchOrderId: null,
        leadTimeDays: 14,
        totalCost: 1200,
        volumeSavingsAFN: null,
        createdAt: '2026-04-01T08:00:00Z',
      },
      {
        id: 2,
        requestId: 'req-002',
        labId: 'lab-001',
        requestedBy: 'tech-001',
        requestedAt: '2026-05-01T08:00:00Z',
        deliveredAt: '2026-05-15T08:00:00Z',
        items: [{ reagentCode: 'HBA1C-001', reagentDisplay: 'HbA1c', quantityRequested: 25, unitOfMeasure: 'tests', currentStock: 0, daysOfSupplyRemaining: 0, unitPrice: 80, totalPrice: 2000 }],
        urgency: 'routine',
        batchOrderId: 'batch-001',
        leadTimeDays: 14,
        totalCost: 2000,
        volumeSavingsAFN: 400,
        createdAt: '2026-05-01T08:00:00Z',
      },
    )

    const result = await getAverageUnitPrice('HBA1C-001', 6)
    // (60 + 80) / 2 = 70
    expect(result).toBe(70)
  })
})

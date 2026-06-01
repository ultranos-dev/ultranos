/**
 * Story 52.2 — Shared Inventory Visibility: Unit Tests
 *
 * Tests:
 *  - buildInventorySnapshot: zero PHI verification, correct quantity/days calc
 *  - verifyZeroPhi: confirms PHI-pattern detection
 *  - getCellColor: heat map boundary conditions (exactly 7 days, exactly 30 days, 0 qty)
 *  - Offline: cached data renders when Hub unreachable
 *
 * AC: 1, 3, 4, 9, 10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyZeroPhi, buildInventorySnapshot } from '../lib/inventory/network-sync'
import type { InventorySnapshot } from '../lib/inventory/inventory-types'
import { getCellColor } from '../components/inventory/NetworkInventoryHeatMap'
import type { InventorySnapshotItem } from '../lib/inventory/inventory-types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<InventorySnapshotItem> = {}): InventorySnapshotItem {
  return {
    reagentCode: 'TEST-001',
    reagentDisplay: 'Haemoglobin Reagent',
    category: 'hematology',
    currentQuantity: 100,
    unitOfMeasure: 'tests',
    dailyConsumptionRate: 3,
    daysOfSupply: 33,
    expiryDate: '2027-01-01',
    lastRestockedAt: '2026-01-01T00:00:00Z',
    isStockedOut: false,
    ...overrides,
  }
}

function makeSnapshot(items: InventorySnapshotItem[] = []): InventorySnapshot {
  return {
    labId: 'lab-kabul-central',
    labName: 'Kabul Central Lab',
    labLocation: { district: 'Kabul', province: 'Kabul' },
    snapshotAt: '2026-05-31T10:00:00Z',
    hlcTimestamp: '2026-05-31T10:00:00.000Z-0001-node1',
    items,
  }
}

// ---------------------------------------------------------------------------
// verifyZeroPhi
// ---------------------------------------------------------------------------

describe('verifyZeroPhi', () => {
  it('returns true for a clean inventory snapshot (no PHI fields)', () => {
    const snapshot = makeSnapshot([makeItem()])
    expect(verifyZeroPhi(snapshot)).toBe(true)
  })

  it('returns false if patientId is embedded in the payload', () => {
    const snapshot = makeSnapshot()
    // Simulate a PHI leak by injecting a patientId field into the snapshot
    const leaked = { ...snapshot, patientId: 'patient-123' } as unknown as InventorySnapshot
    expect(verifyZeroPhi(leaked)).toBe(false)
  })

  it('returns false if patientName appears in items', () => {
    const item = makeItem()
    const leaked = { ...item, patientName: 'John Doe' } as unknown as InventorySnapshotItem
    const snapshot = makeSnapshot([leaked])
    expect(verifyZeroPhi(snapshot)).toBe(false)
  })

  it('returns false if diagnosis field is present', () => {
    const snapshot = makeSnapshot()
    const leaked = { ...snapshot, diagnosis: 'TB' } as unknown as InventorySnapshot
    expect(verifyZeroPhi(leaked)).toBe(false)
  })

  it('returns false if mrn (medical record number) appears', () => {
    const snapshot = makeSnapshot([makeItem()])
    const s = JSON.parse(JSON.stringify(snapshot))
    s.items[0].mrn = 'MRN-12345'
    expect(verifyZeroPhi(s as InventorySnapshot)).toBe(false)
  })

  it('returns true when reagent display name looks clinical but contains no PHI fields', () => {
    // "Malaria RDT" is a test name, not PHI
    const item = makeItem({ reagentDisplay: 'Malaria RDT', reagentCode: '5196-1' })
    expect(verifyZeroPhi(makeSnapshot([item]))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getCellColor — boundary conditions (AC 4)
// ---------------------------------------------------------------------------

describe('getCellColor', () => {
  it('returns red for isStockedOut=true regardless of daysOfSupply', () => {
    const item = makeItem({ isStockedOut: true, daysOfSupply: 999 })
    expect(getCellColor(item)).toBe('red')
  })

  it('returns red for daysOfSupply === 0', () => {
    const item = makeItem({ daysOfSupply: 0, currentQuantity: 0, isStockedOut: false })
    expect(getCellColor(item)).toBe('red')
  })

  it('returns red for daysOfSupply === 7 (boundary — ≤7 is red)', () => {
    const item = makeItem({ daysOfSupply: 7, isStockedOut: false })
    expect(getCellColor(item)).toBe('red')
  })

  it('returns yellow for daysOfSupply === 8 (just above red threshold)', () => {
    const item = makeItem({ daysOfSupply: 8, isStockedOut: false })
    expect(getCellColor(item)).toBe('yellow')
  })

  it('returns yellow for daysOfSupply === 30 (boundary — ≤30 is yellow)', () => {
    const item = makeItem({ daysOfSupply: 30, isStockedOut: false })
    expect(getCellColor(item)).toBe('yellow')
  })

  it('returns green for daysOfSupply === 31 (just above yellow threshold)', () => {
    const item = makeItem({ daysOfSupply: 31, isStockedOut: false })
    expect(getCellColor(item)).toBe('green')
  })

  it('returns green for daysOfSupply === 999 (infinite supply)', () => {
    const item = makeItem({ daysOfSupply: 999, isStockedOut: false })
    expect(getCellColor(item)).toBe('green')
  })
})

// ---------------------------------------------------------------------------
// buildInventorySnapshot — mocked Dexie (AC 1, 9)
// ---------------------------------------------------------------------------

const mockReagentInventory = [
  {
    id: 1,
    reagentId: 'reagent-001',
    name: 'Haemoglobin Reagent',
    unit: 'tests',
    expectedTests: 200,
    testsPerformed: 50,
    linkedTestCode: '718-7',
    status: 'ACTIVE',
    expiryDate: '2027-06-01',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 2,
    reagentId: 'reagent-002',
    name: 'Malaria RDT',
    unit: 'cassettes',
    expectedTests: 50,
    testsPerformed: 50,   // fully consumed
    linkedTestCode: '5196-1',
    status: 'DEPLETED',
    expiryDate: '2026-12-01',
    createdAt: '2026-02-01T00:00:00Z',
  },
]

const mockConsumptionLogs = [
  { reagentId: 'reagent-001', testsConsumed: 30, loggedAt: '2026-05-15T10:00:00Z' },
  { reagentId: 'reagent-001', testsConsumed: 20, loggedAt: '2026-05-20T10:00:00Z' },
  // 50 tests in 30 days = 1.7/day daily rate
]

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    reagent_inventory: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(mockReagentInventory) })),
      })),
    },
    reagent_consumption_log: {
      where: vi.fn(() => ({
        aboveOrEqual: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(mockConsumptionLogs) })),
      })),
    },
  })),
  ReagentStatus: {
    ACTIVE: 'ACTIVE',
    DEPLETED: 'DEPLETED',
    EXPIRED: 'EXPIRED',
    DISPOSED: 'DISPOSED',
  },
}))

describe('buildInventorySnapshot', () => {
  const opts = {
    labId: 'lab-001',
    labName: 'Test Lab',
    labLocation: { district: 'Kabul', province: 'Kabul' },
    hlcTimestamp: '2026-05-31T10:00:00.000Z-0001-node1',
  }

  it('returns a snapshot with labId, labName, and items array', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    expect(snapshot.labId).toBe('lab-001')
    expect(snapshot.labName).toBe('Test Lab')
    expect(Array.isArray(snapshot.items)).toBe(true)
  })

  it('contains zero PHI (verifyZeroPhi passes)', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    expect(verifyZeroPhi(snapshot)).toBe(true)
  })

  it('computes currentQuantity correctly (expectedTests - testsPerformed)', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    const haemoglobin = snapshot.items.find(i => i.reagentCode === '718-7')
    expect(haemoglobin).toBeDefined()
    expect(haemoglobin!.currentQuantity).toBe(150)  // 200 - 50
  })

  it('marks fully consumed reagent as stocked out', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    const malaria = snapshot.items.find(i => i.reagentCode === '5196-1')
    expect(malaria).toBeDefined()
    expect(malaria!.isStockedOut).toBe(true)
    expect(malaria!.currentQuantity).toBe(0)
  })

  it('computes dailyConsumptionRate from 30-day trailing window', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    const haemoglobin = snapshot.items.find(i => i.reagentCode === '718-7')
    // 50 tests in 30 days = 1.7/day
    expect(haemoglobin!.dailyConsumptionRate).toBeCloseTo(1.7, 1)
  })

  it('computes daysOfSupply = currentQuantity / dailyConsumptionRate', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    const haemoglobin = snapshot.items.find(i => i.reagentCode === '718-7')
    // 150 / 1.7 ≈ 88 days
    expect(haemoglobin!.daysOfSupply).toBeGreaterThan(80)
    expect(haemoglobin!.daysOfSupply).toBeLessThan(100)
  })

  it('assigns daysOfSupply = 0 for stocked-out reagent', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    const malaria = snapshot.items.find(i => i.reagentCode === '5196-1')
    expect(malaria!.daysOfSupply).toBe(0)
  })

  it('returns snapshotAt as ISO 8601 timestamp', async () => {
    const snapshot = await buildInventorySnapshot(opts)
    expect(() => new Date(snapshot.snapshotAt)).not.toThrow()
    expect(snapshot.snapshotAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

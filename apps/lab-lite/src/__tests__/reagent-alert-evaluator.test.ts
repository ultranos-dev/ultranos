/**
 * Story 48.2 — Unit tests for reagent-alert-evaluator.ts
 * Task 10
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  evaluateAllReagentAlerts,
  shouldRefireAlert,
  getCachedAlerts,
} from '../lib/reagent-alert-evaluator'
import type { ReagentAlertCache } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockReagents: import('../lib/db').ReagentInventoryEntry[] = []
const mockSuppliers: import('../lib/db').SupplierConfig[] = []
const mockMappings: import('../lib/db').ReagentSupplierMapping[] = []
const mockAlertCache: (ReagentAlertCache & { id: number })[] = []

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getActiveReagents: vi.fn(async () => [...mockReagents]),
    getAllSuppliers: vi.fn(async () => [...mockSuppliers]),
    getAllReagentSupplierMappings: vi.fn(async () => [...mockMappings]),
    upsertReagentAlert: vi.fn(async (alert) => {
      const idx = mockAlertCache.findIndex((a) => a.reagentId === alert.reagentId)
      if (idx >= 0) mockAlertCache.splice(idx, 1)
      mockAlertCache.push({ ...alert, id: mockAlertCache.length + 1 })
    }),
    getAllReagentAlerts: vi.fn(async () => [...mockAlertCache]),
  }
})

vi.mock('../lib/reagent-burndown', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/reagent-burndown')>()
  return {
    ...original,
    calculateDailyConsumptionRate: vi.fn(async () => ({
      averageDailyUsage: 10,
      unit: 'mL',
      dataPointCount: 15,
      confidenceLevel: 'high',
    })),
  }
})

function makeReagent(
  id: string,
  expiryDaysFromNow: number,
): import('../lib/db').ReagentInventoryEntry {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + expiryDaysFromNow)
  return {
    reagentId: id,
    name: `Reagent ${id}`,
    lotNumber: 'LOT001',
    openDate: new Date().toISOString().slice(0, 10),
    expiryDate: expiry.toISOString().slice(0, 10),
    expectedTests: 100,
    testsPerformed: 0,
    unit: 'mL',
    costPerUnit: 500,
    status: 'ACTIVE' as import('../lib/db').ReagentStatus,
    disposalDate: null,
    disposalReason: null,
    disposalNotes: null,
    remainingAtDisposal: null,
    linkedTestCode: '14749-6',
    hlcTimestamp: '',
    createdAt: new Date().toISOString(),
    syncStatus: 'pending' as import('../lib/db').ReagentSyncStatus,
  }
}

beforeEach(() => {
  mockReagents.length = 0
  mockSuppliers.length = 0
  mockMappings.length = 0
  mockAlertCache.length = 0
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// evaluateAllReagentAlerts
// ---------------------------------------------------------------------------

describe('evaluateAllReagentAlerts', () => {
  it('returns empty array when no reagents', async () => {
    const alerts = await evaluateAllReagentAlerts()
    expect(alerts).toHaveLength(0)
  })

  it('fires critical alert for reagent depleting in 5 days', async () => {
    // Stock 100, rate 10/day → depletes in 10 days (expiry is 5 days → effective = 5)
    const r = makeReagent('r1', 5)
    r.expectedTests = 1000
    r.testsPerformed = 0
    mockReagents.push(r)

    const alerts = await evaluateAllReagentAlerts()
    expect(alerts.length).toBeGreaterThan(0)
    const alert = alerts.find((a) => a.reagentId === 'r1')
    expect(alert?.alertLevel).toBe('critical')
  })

  it('fires warning alert for reagent depleting in 12 days', async () => {
    const r = makeReagent('r1', 12)
    r.expectedTests = 1000
    r.testsPerformed = 0
    mockReagents.push(r)

    const alerts = await evaluateAllReagentAlerts()
    const alert = alerts.find((a) => a.reagentId === 'r1')
    expect(alert?.alertLevel).toBe('warning')
  })

  it('fires info alert for reagent depleting in 25 days (expiry-driven)', async () => {
    // Set very high stock so usage depletion is far in the future (1000 days at rate 10/day)
    // → effective is driven by expiry (25 days) → info
    const r = makeReagent('r1', 25)
    r.expectedTests = 10000  // 10000/10 = 1000 days usage depletion
    r.testsPerformed = 0
    mockReagents.push(r)

    const alerts = await evaluateAllReagentAlerts()
    const alert = alerts.find((a) => a.reagentId === 'r1')
    expect(alert?.alertLevel).toBe('info')
  })

  it('does not fire alert for reagent safe > 30 days', async () => {
    const r = makeReagent('r1', 60)
    r.expectedTests = 1000
    r.testsPerformed = 0
    mockReagents.push(r)

    const alerts = await evaluateAllReagentAlerts()
    const alert = alerts.find((a) => a.reagentId === 'r1')
    expect(alert).toBeUndefined()
  })

  it('returns alerts for mixed inventory', async () => {
    mockReagents.push(makeReagent('r-critical', 5))
    // Safe reagent: very high stock so usage depletion is 1000 days; expiry = 90 days → none
    const safe = makeReagent('r-safe', 90)
    safe.expectedTests = 10000
    safe.testsPerformed = 0
    mockReagents.push(safe)
    const alerts = await evaluateAllReagentAlerts()
    expect(alerts.some((a) => a.reagentId === 'r-critical')).toBe(true)
    expect(alerts.find((a) => a.reagentId === 'r-safe')).toBeUndefined()
  })

  it('includes supplier name when mapping exists', async () => {
    mockReagents.push(makeReagent('r1', 5))
    mockSuppliers.push({
      id: 1,
      supplierId: 's1',
      supplierName: 'MedSupply Co',
      leadTimeDays: 14,
      contactInfo: '+93-700-000001',
      notes: '',
      updatedAt: new Date().toISOString(),
    })
    mockMappings.push({ reagentId: 'r1', supplierId: 's1' })

    const alerts = await evaluateAllReagentAlerts()
    const alert = alerts.find((a) => a.reagentId === 'r1')
    expect(alert?.supplierName).toBe('MedSupply Co')
    expect(alert?.supplierLeadTimeDays).toBe(14)
  })
})

// ---------------------------------------------------------------------------
// shouldRefireAlert
// ---------------------------------------------------------------------------

describe('shouldRefireAlert', () => {
  function makeCachedAlert(
    level: ReagentAlertCache['alertLevel'],
    hoursAgo: number,
  ): ReagentAlertCache {
    const evaluated = new Date()
    evaluated.setHours(evaluated.getHours() - hoursAgo)
    return {
      reagentId: 'r1',
      reagentName: 'Test Reagent',
      alertLevel: level,
      daysRemaining: 5,
      effectiveDate: new Date().toISOString(),
      reason: 'expiry',
      reorderDate: new Date().toISOString(),
      evaluatedAt: evaluated.toISOString(),
      acknowledged: false,
    }
  }

  it('suppresses same-level alert within 24 hours', () => {
    const cached = makeCachedAlert('warning', 12)
    expect(shouldRefireAlert(cached, 'warning', new Date())).toBe(false)
  })

  it('re-fires same-level alert after 24 hours', () => {
    const cached = makeCachedAlert('warning', 25)
    expect(shouldRefireAlert(cached, 'warning', new Date())).toBe(true)
  })

  it('always re-fires when severity escalates', () => {
    const cached = makeCachedAlert('warning', 1)  // only 1 hour ago
    expect(shouldRefireAlert(cached, 'critical', new Date())).toBe(true)
  })

  it('does not re-fire when severity de-escalates within 24h', () => {
    const cached = makeCachedAlert('critical', 1)
    expect(shouldRefireAlert(cached, 'info', new Date())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getCachedAlerts
// ---------------------------------------------------------------------------

describe('getCachedAlerts', () => {
  it('returns only unacknowledged non-none alerts', async () => {
    mockAlertCache.push(
      { id: 1, reagentId: 'r1', reagentName: 'R1', alertLevel: 'critical', daysRemaining: 3, effectiveDate: new Date().toISOString(), reason: 'expiry', reorderDate: new Date().toISOString(), evaluatedAt: new Date().toISOString(), acknowledged: false },
      { id: 2, reagentId: 'r2', reagentName: 'R2', alertLevel: 'warning', daysRemaining: 10, effectiveDate: new Date().toISOString(), reason: 'usage', reorderDate: new Date().toISOString(), evaluatedAt: new Date().toISOString(), acknowledged: true },
      { id: 3, reagentId: 'r3', reagentName: 'R3', alertLevel: 'none', daysRemaining: 60, effectiveDate: new Date().toISOString(), reason: 'usage', reorderDate: new Date().toISOString(), evaluatedAt: new Date().toISOString(), acknowledged: false },
    )
    const result = await getCachedAlerts()
    expect(result).toHaveLength(1)
    expect(result[0].reagentId).toBe('r1')
  })
})

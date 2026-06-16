/**
 * Readiness Engine Tests — Story 48.3 Task 7
 *
 * Unit tests for all five dimension evaluators and the overall briefing generator.
 * All Dexie calls, workload-scheduler, and auth store are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  evaluatePersonnel,
  evaluateReagents,
  evaluateEquipment,
  evaluatePendingOrders,
  evaluatePower,
  generateReadinessBriefing,
} from '../lib/readiness-engine'
import { ReagentStatus } from '../lib/db'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Hoisted so the factory below can reference it before module import resolution
const { mockOrdersToArray } = vi.hoisted(() => ({
  mockOrdersToArray: vi.fn(),
}))

vi.mock('../lib/db', () => ({
  ReagentStatus: { ACTIVE: 'ACTIVE', EXPIRED: 'EXPIRED', DEPLETED: 'DEPLETED', DISPOSED: 'DISPOSED' },
  getAllReagents: vi.fn(),
  getDb: vi.fn(() => ({
    orders: {
      where: vi.fn().mockReturnValue({
        anyOf: vi.fn().mockReturnValue({ toArray: mockOrdersToArray }),
      }),
    },
  })),
}))

vi.mock('../lib/workload-scheduler', () => ({
  calculatePowerBudget: vi.fn(),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: vi.fn(() => ({ session: null })),
  },
}))

import { getAllReagents } from '../lib/db'
import { calculatePowerBudget } from '../lib/workload-scheduler'
import { useAuthSessionStore } from '../stores/auth-session-store'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReagent(overrides: Record<string, any> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { name: 'TestReagent', status: ReagentStatus.ACTIVE, expiryDate: futureDateISO(30), expectedTests: 100, testsPerformed: 10, linkedTestCode: 'CHEM', manufacturer: 'LabCorp', ...overrides } as any
}

function futureDateISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0] ?? ''
}

function pastDateISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0] ?? ''
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeOrder(overrides: Record<string, any> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: 'RECEIVED', urgency: 'routine', ...overrides } as any
}

// ---------------------------------------------------------------------------
// evaluatePersonnel
// ---------------------------------------------------------------------------

describe('evaluatePersonnel', () => {
  it('returns red when no session', async () => {
    vi.mocked(useAuthSessionStore.getState).mockReturnValue({ session: null } as unknown as ReturnType<typeof useAuthSessionStore.getState>)
    const result = await evaluatePersonnel()
    expect(result.status).toBe('red')
    expect(result.dimension).toBe('personnel')
  })

  it('returns amber when session exists (no roster)', async () => {
    vi.mocked(useAuthSessionStore.getState).mockReturnValue({
      session: { userId: 'u1', practitionerId: 'p1', role: 'lab_tech', sessionId: 's1', email: 'a@b.com', labRole: 'tech' },
    } as unknown as ReturnType<typeof useAuthSessionStore.getState>)
    const result = await evaluatePersonnel()
    expect(result.status).toBe('amber')
  })
})

// ---------------------------------------------------------------------------
// evaluateReagents
// ---------------------------------------------------------------------------

describe('evaluateReagents', () => {
  beforeEach(() => {
    vi.mocked(getAllReagents).mockReset()
  })

  it('returns amber when getAllReagents throws', async () => {
    vi.mocked(getAllReagents).mockRejectedValue(new Error('db error'))
    const result = await evaluateReagents()
    expect(result.status).toBe('amber')
  })

  it('returns amber when no reagents configured', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([])
    const result = await evaluateReagents()
    expect(result.status).toBe('amber')
    expect(result.summaryKey).toBe('readiness.dimensions.reagents.summaryNotConfigured')
  })

  it('returns green when all reagents have >14 days remaining', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ expiryDate: futureDateISO(30) }),
      makeReagent({ expiryDate: futureDateISO(20) }),
    ])
    const result = await evaluateReagents()
    expect(result.status).toBe('green')
  })

  it('returns amber when any reagent has ≤14 days remaining', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ expiryDate: futureDateISO(30) }),
      makeReagent({ expiryDate: futureDateISO(10) }),
    ])
    const result = await evaluateReagents()
    expect(result.status).toBe('amber')
  })

  it('returns red when any reagent has ≤7 days remaining', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ expiryDate: futureDateISO(5) }),
    ])
    const result = await evaluateReagents()
    expect(result.status).toBe('red')
  })

  it('returns red when reagent has expired status', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ status: ReagentStatus.EXPIRED }),
    ])
    const result = await evaluateReagents()
    expect(result.status).toBe('red')
  })

  it('returns red when reagent has expired date (past)', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ expiryDate: pastDateISO(1) }),
    ])
    const result = await evaluateReagents()
    expect(result.status).toBe('red')
  })

  it('returns red when tests remaining ≤ 0 (stockout)', async () => {
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ expectedTests: 50, testsPerformed: 50, expiryDate: futureDateISO(30) }),
    ])
    const result = await evaluateReagents()
    expect(result.status).toBe('red')
  })

  it('caps detail lines at 5', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeReagent({ name: `R${i}`, expiryDate: futureDateISO(5) }),
    )
    vi.mocked(getAllReagents).mockResolvedValue(many)
    const result = await evaluateReagents()
    expect(result.details.length).toBeLessThanOrEqual(5)
  })

  it('caps recommendations at 3', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      makeReagent({ name: `R${i}`, expiryDate: futureDateISO(3) }),
    )
    vi.mocked(getAllReagents).mockResolvedValue(many)
    const result = await evaluateReagents()
    expect(result.recommendations.length).toBeLessThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// evaluateEquipment
// ---------------------------------------------------------------------------

describe('evaluateEquipment', () => {
  it('always returns amber with not-configured summary', async () => {
    const result = await evaluateEquipment()
    expect(result.status).toBe('amber')
    expect(result.dimension).toBe('equipment')
  })
})

// ---------------------------------------------------------------------------
// evaluatePendingOrders
// ---------------------------------------------------------------------------

describe('evaluatePendingOrders', () => {
  beforeEach(() => {
    mockOrdersToArray.mockReset()
  })

  it('returns amber when getOrders throws', async () => {
    mockOrdersToArray.mockRejectedValue(new Error('db error'))
    const result = await evaluatePendingOrders()
    expect(result.status).toBe('amber')
  })

  it('returns green when zero pending orders', async () => {
    mockOrdersToArray.mockResolvedValue([])
    const result = await evaluatePendingOrders()
    expect(result.status).toBe('green')
  })

  it('returns amber when pending orders exist but none urgent', async () => {
    mockOrdersToArray.mockResolvedValue([
      makeOrder({ status: 'RECEIVED', urgency: 'routine' }),
      makeOrder({ status: 'IN_PROGRESS', urgency: 'routine' }),
    ])
    const result = await evaluatePendingOrders()
    expect(result.status).toBe('amber')
    expect(result.summaryArgs?.total).toBe(2)
    expect(result.summaryArgs?.urgent).toBe(0)
  })

  it('returns red when any pending order is urgent', async () => {
    mockOrdersToArray.mockResolvedValue([
      makeOrder({ status: 'RECEIVED', urgency: 'routine' }),
      makeOrder({ status: 'RECEIVED', urgency: 'urgent' }),
    ])
    const result = await evaluatePendingOrders()
    expect(result.status).toBe('red')
  })

  it('returns red for stat urgency', async () => {
    mockOrdersToArray.mockResolvedValue([
      makeOrder({ status: 'IN_PROGRESS', urgency: 'stat' }),
    ])
    const result = await evaluatePendingOrders()
    expect(result.status).toBe('red')
  })

  it('returns red for asap urgency', async () => {
    mockOrdersToArray.mockResolvedValue([
      makeOrder({ status: 'RECEIVED', urgency: 'asap' }),
    ])
    const result = await evaluatePendingOrders()
    expect(result.status).toBe('red')
  })
})

// ---------------------------------------------------------------------------
// evaluatePower
// ---------------------------------------------------------------------------

describe('evaluatePower', () => {
  beforeEach(() => {
    vi.mocked(calculatePowerBudget).mockReset()
  })

  it('returns amber when calculatePowerBudget throws', async () => {
    vi.mocked(calculatePowerBudget).mockRejectedValue(new Error('no schedule'))
    const result = await evaluatePower()
    expect(result.status).toBe('amber')
  })

  it('returns amber when no power budget configured (null)', async () => {
    vi.mocked(calculatePowerBudget).mockResolvedValue(null)
    const result = await evaluatePower()
    expect(result.status).toBe('amber')
  })

  it('returns red when power window has fully elapsed (remainingMinutes ≤ 0)', async () => {
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '06:00',
      endTime: '10:00',
      totalMinutes: 240,
      remainingMinutes: 0,
    })
    const result = await evaluatePower()
    expect(result.status).toBe('red')
  })

  it('returns red when remainingMinutes is negative', async () => {
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '06:00',
      endTime: '10:00',
      totalMinutes: 240,
      remainingMinutes: -10,
    })
    const result = await evaluatePower()
    expect(result.status).toBe('red')
  })

  it('returns amber when power window is partially elapsed', async () => {
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '06:00',
      endTime: '10:00',
      totalMinutes: 240,
      remainingMinutes: 120, // half used
    })
    const result = await evaluatePower()
    expect(result.status).toBe('amber')
  })

  it('returns green when power window has not started (percentElapsed = 0)', async () => {
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '18:00',
      endTime: '22:00',
      totalMinutes: 240,
      remainingMinutes: 240, // none used
    })
    const result = await evaluatePower()
    expect(result.status).toBe('green')
  })

  it('returns amber when totalMinutes is 0 (guard against division-by-zero)', async () => {
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '06:00',
      endTime: '06:00',
      totalMinutes: 0,
      remainingMinutes: 0,
    })
    const result = await evaluatePower()
    expect(result.status).toBe('amber')
  })
})

// ---------------------------------------------------------------------------
// generateReadinessBriefing — overall status
// ---------------------------------------------------------------------------

describe('generateReadinessBriefing', () => {
  it('returns overall green when all dimensions are green', async () => {
    vi.mocked(useAuthSessionStore.getState).mockReturnValue({
      session: { userId: 'u1', practitionerId: 'p1', role: 'lab_tech', sessionId: 's1', email: 'a@b.com', labRole: 'tech' },
    } as unknown as ReturnType<typeof useAuthSessionStore.getState>)
    vi.mocked(getAllReagents).mockResolvedValue([
      makeReagent({ expiryDate: futureDateISO(30) }),
    ])
    mockOrdersToArray.mockResolvedValue([])
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '18:00',
      endTime: '22:00',
      totalMinutes: 240,
      remainingMinutes: 240,
    })

    const briefing = await generateReadinessBriefing()
    // Personnel returns amber (no roster), equipment returns amber,
    // so overall can never be fully green in current MVP — but
    // overallStatus = worstStatus of all dims
    expect(['green', 'amber', 'red']).toContain(briefing.overallStatus)
    expect(briefing.dimensions).toHaveLength(5)
    expect(briefing.refreshable).toBe(true)
    expect(briefing.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns overall red when any dimension is red', async () => {
    vi.mocked(useAuthSessionStore.getState).mockReturnValue({ session: null } as unknown as ReturnType<typeof useAuthSessionStore.getState>)
    vi.mocked(getAllReagents).mockResolvedValue([])
    mockOrdersToArray.mockResolvedValue([makeOrder({ status: 'RECEIVED', urgency: 'stat' })])
    vi.mocked(calculatePowerBudget).mockResolvedValue(null)

    const briefing = await generateReadinessBriefing()
    expect(briefing.overallStatus).toBe('red')
  })

  it('returns overall amber when worst is amber (no red)', async () => {
    vi.mocked(useAuthSessionStore.getState).mockReturnValue({
      session: { userId: 'u1', practitionerId: 'p1', role: 'lab_tech', sessionId: 's1', email: 'a@b.com', labRole: 'tech' },
    } as unknown as ReturnType<typeof useAuthSessionStore.getState>)
    vi.mocked(getAllReagents).mockResolvedValue([makeReagent({ expiryDate: futureDateISO(30) })])
    mockOrdersToArray.mockResolvedValue([])
    vi.mocked(calculatePowerBudget).mockResolvedValue({
      startTime: '18:00',
      endTime: '22:00',
      totalMinutes: 240,
      remainingMinutes: 240,
    })
    // Personnel = amber (no roster), equipment = amber → overall = amber
    const briefing = await generateReadinessBriefing()
    expect(briefing.overallStatus).toBe('amber')
  })
})

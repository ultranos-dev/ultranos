/**
 * RAG Readiness Service tests — Story 51.5
 *
 * Tests all four RAG dimensions and overall worst-status derivation.
 * Mocks Dexie and db helpers to isolate pure calculation logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock db module before importing the service under test
vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  getAllSupplyItems: vi.fn(),
  getMinimumStaffing: vi.fn(),
}))

import {
  calculatePersonnelRAG,
  calculateEquipmentRAG,
  calculateSupplyRAG,
  calculateQCRAG,
  getFullRAGStatus,
} from '@/lib/rag-service'
import { getDb, getAllSupplyItems, getMinimumStaffing } from '@/lib/db'

const mockGetDb = vi.mocked(getDb)
const mockGetAllSupplyItems = vi.mocked(getAllSupplyItems)
const mockGetMinimumStaffing = vi.mocked(getMinimumStaffing)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    shift_sessions: {
      toArray: vi.fn().mockResolvedValue([]),
    },
    instruments: {
      toArray: vi.fn().mockResolvedValue([]),
    },
    qcRuns: {
      filter: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    driftAlerts: {
      filter: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetMinimumStaffing.mockResolvedValue(2)
  mockGetAllSupplyItems.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Personnel dimension
// ---------------------------------------------------------------------------

describe('calculatePersonnelRAG', () => {
  it('returns GREEN when active staff exceeds minimum', async () => {
    const sessions = [
      { techId: 'tech-001', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
      { techId: 'tech-002', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
      { techId: 'tech-003', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    expect(result.status).toBe('GREEN')
    expect(result.summary).toContain('3 techs on shift')
  })

  it('returns AMBER when active staff equals minimum', async () => {
    const sessions = [
      { techId: 'tech-001', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
      { techId: 'tech-002', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    expect(result.status).toBe('AMBER')
    expect(result.summary).toContain('2 techs on shift')
  })

  it('returns RED when active staff is below minimum', async () => {
    const sessions = [
      { techId: 'tech-001', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    expect(result.status).toBe('RED')
    expect(result.summary).toContain('1 tech on shift')
  })

  it('returns RED with "0 techs" when no active sessions', async () => {
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue([]) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    expect(result.status).toBe('RED')
    expect(result.summary).toContain('0 techs on shift')
  })

  it('uses minimumStaffing from lab_config', async () => {
    mockGetMinimumStaffing.mockResolvedValue(5)
    const sessions = [
      { techId: 'tech-001', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    expect(result.status).toBe('RED')
    expect(result.summary).toContain('minimum: 5')
  })

  it('returns AMBER on db error', async () => {
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockRejectedValue(new Error('db fail')) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    expect(result.status).toBe('AMBER')
    expect(result.summary).toContain('unavailable')
  })

  it('maps ACTIVE sessions to ON_SHIFT detail status', async () => {
    const sessions = [
      { techId: 'tech-abc', status: 'ACTIVE', startedAt: '2026-06-01T06:00:00Z', endedAt: null },
      { techId: 'tech-xyz', status: 'ENDED', startedAt: '2026-06-01T04:00:00Z', endedAt: '2026-06-01T06:00:00Z' },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
    }) as ReturnType<typeof getDb>)

    const result = await calculatePersonnelRAG()
    const details = result.details as import('@/lib/rag-service').PersonnelDetail[]
    expect(details.find((d) => d.techId === 'tech-abc')?.status).toBe('ON_SHIFT')
    expect(details.find((d) => d.techId === 'tech-xyz')?.status).toBe('ENDED')
  })
})

// ---------------------------------------------------------------------------
// Equipment dimension
// ---------------------------------------------------------------------------

describe('calculateEquipmentRAG', () => {
  it('returns GREEN when all instruments are IN_SERVICE', async () => {
    const instruments = [
      { id: 'inst-1', name: 'Analyzer A', status: 'IN_SERVICE', outOfServiceReason: null, updatedAt: '2026-06-01T06:00:00Z' },
      { id: 'inst-2', name: 'Centrifuge B', status: 'IN_SERVICE', outOfServiceReason: null, updatedAt: '2026-06-01T06:00:00Z' },
    ]
    mockGetDb.mockReturnValue(makeDb({
      instruments: { toArray: vi.fn().mockResolvedValue(instruments) },
    }) as ReturnType<typeof getDb>)

    const result = await calculateEquipmentRAG()
    expect(result.status).toBe('GREEN')
    expect(result.summary).toBe('2/2 instruments operational')
  })

  it('returns RED when any instrument is OUT_OF_SERVICE', async () => {
    const instruments = [
      { id: 'inst-1', name: 'Analyzer A', status: 'IN_SERVICE', outOfServiceReason: null, updatedAt: '2026-06-01T06:00:00Z' },
      { id: 'inst-2', name: 'Centrifuge B', status: 'OUT_OF_SERVICE', outOfServiceReason: 'Pump failure', updatedAt: '2026-06-01T06:00:00Z' },
    ]
    mockGetDb.mockReturnValue(makeDb({
      instruments: { toArray: vi.fn().mockResolvedValue(instruments) },
    }) as ReturnType<typeof getDb>)

    const result = await calculateEquipmentRAG()
    expect(result.status).toBe('RED')
    expect(result.summary).toBe('1/2 instruments operational')
  })

  it('returns AMBER when no instruments configured', async () => {
    mockGetDb.mockReturnValue(makeDb({
      instruments: { toArray: vi.fn().mockResolvedValue([]) },
    }) as ReturnType<typeof getDb>)

    const result = await calculateEquipmentRAG()
    expect(result.status).toBe('AMBER')
    expect(result.summary).toContain('No instruments configured')
  })

  it('returns AMBER on db error', async () => {
    mockGetDb.mockReturnValue(makeDb({
      instruments: { toArray: vi.fn().mockRejectedValue(new Error('db fail')) },
    }) as ReturnType<typeof getDb>)

    const result = await calculateEquipmentRAG()
    expect(result.status).toBe('AMBER')
  })
})

// ---------------------------------------------------------------------------
// Supply dimension
// ---------------------------------------------------------------------------

describe('calculateSupplyRAG', () => {
  it('returns GREEN when all supplies above reorder threshold', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'Reagent A', category: 'Reagent', currentStock: 100, unit: 'mL', reorderThreshold: 20, criticalThreshold: 5, dailyUsageEstimate: 10, lastUpdated: '', updatedBy: '' },
    ])

    const result = await calculateSupplyRAG()
    expect(result.status).toBe('GREEN')
    expect(result.summary).toContain('All 1 supply item')
  })

  it('returns AMBER when stock is between critical and reorder thresholds', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'Reagent A', category: 'Reagent', currentStock: 15, unit: 'mL', reorderThreshold: 20, criticalThreshold: 5, dailyUsageEstimate: 5, lastUpdated: '', updatedBy: '' },
    ])

    const result = await calculateSupplyRAG()
    expect(result.status).toBe('AMBER')
    expect(result.summary).toContain('Reagent A')
  })

  it('returns RED when stock at or below critical threshold', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'Control Material X', category: 'Control Material', currentStock: 5, unit: 'vials', reorderThreshold: 20, criticalThreshold: 5, dailyUsageEstimate: 2, lastUpdated: '', updatedBy: '' },
    ])

    const result = await calculateSupplyRAG()
    expect(result.status).toBe('RED')
    expect(result.summary).toContain('Control Material X')
  })

  it('calculates estimated days remaining from dailyUsageEstimate', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'Reagent A', category: 'Reagent', currentStock: 30, unit: 'mL', reorderThreshold: 5, criticalThreshold: 2, dailyUsageEstimate: 10, lastUpdated: '', updatedBy: '' },
    ])

    const result = await calculateSupplyRAG()
    const details = result.details as import('@/lib/rag-service').SupplyDetail[]
    expect(details[0].estimatedDaysRemaining).toBe(3)
  })

  it('sets estimatedDaysRemaining to null when dailyUsage is 0', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'Reagent A', category: 'Reagent', currentStock: 50, unit: 'mL', reorderThreshold: 5, criticalThreshold: 2, dailyUsageEstimate: 0, lastUpdated: '', updatedBy: '' },
    ])

    const result = await calculateSupplyRAG()
    const details = result.details as import('@/lib/rag-service').SupplyDetail[]
    expect(details[0].estimatedDaysRemaining).toBeNull()
  })

  it('returns AMBER when no supply items configured', async () => {
    mockGetAllSupplyItems.mockResolvedValue([])
    const result = await calculateSupplyRAG()
    expect(result.status).toBe('AMBER')
  })

  it('overall status is worst of all individual supply statuses', async () => {
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'Good Stock', category: 'Reagent', currentStock: 100, unit: 'mL', reorderThreshold: 10, criticalThreshold: 2, dailyUsageEstimate: 5, lastUpdated: '', updatedBy: '' },
      { id: '2', name: 'Critical Stock', category: 'Control Material', currentStock: 1, unit: 'vials', reorderThreshold: 10, criticalThreshold: 2, dailyUsageEstimate: 1, lastUpdated: '', updatedBy: '' },
    ])

    const result = await calculateSupplyRAG()
    expect(result.status).toBe('RED')
  })
})

// ---------------------------------------------------------------------------
// QC dimension
// ---------------------------------------------------------------------------

describe('calculateQCRAG', () => {
  function makeQcRun(overrides: Partial<{
    analyte: string; loincCode: string; runDate: string;
    observedValue: number; targetMean: number; targetSd: number;
  }> = {}) {
    return {
      analyte: 'Glucose',
      loincCode: '2345-7',
      runDate: new Date().toISOString(),
      observedValue: 5.0,
      targetMean: 5.0,
      targetSd: 0.2,
      ...overrides,
    }
  }

  function makeDriftAlert(analyte: string, rule: string) {
    return { analyte, ruleViolated: rule, acknowledgedAt: null }
  }

  it('returns GREEN when all recent runs are within 2SD', async () => {
    const db = makeDb({
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([makeQcRun()]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    })
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

    const result = await calculateQCRAG()
    expect(result.status).toBe('GREEN')
    expect(result.summary).toContain('1/1 analyte')
  })

  it('returns RED when observedValue violates 1-3s reject rule (|z| > 3SD)', async () => {
    const db = makeDb({
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([
          makeQcRun({ observedValue: 5.0 + 3.1 * 0.2 }), // z > 3
        ]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    })
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

    const result = await calculateQCRAG()
    expect(result.status).toBe('RED')
    const details = result.details as import('@/lib/rag-service').QcDetail[]
    expect(details[0].status).toBe('FAILED')
  })

  it('returns AMBER when unacknowledged drift alert exists', async () => {
    const db = makeDb({
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([makeQcRun()]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([makeDriftAlert('Glucose', '2-2s')]),
      },
    })
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

    const result = await calculateQCRAG()
    expect(result.status).toBe('AMBER')
    const details = result.details as import('@/lib/rag-service').QcDetail[]
    expect(details[0].status).toBe('DRIFT_WARNING')
    expect(details[0].westgardViolations).toContain('2-2s')
  })

  it('returns AMBER when no QC data in current shift window', async () => {
    const db = makeDb({
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    })
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

    const result = await calculateQCRAG()
    expect(result.status).toBe('AMBER')
    expect(result.summary).toContain('No QC data')
  })

  it('keeps latest run per analyte when multiple runs exist', async () => {
    const older = makeQcRun({ runDate: '2026-06-01T04:00:00Z', observedValue: 5.0 + 3.5 * 0.2 })
    const newer = makeQcRun({ runDate: '2026-06-01T07:00:00Z', observedValue: 5.0 })
    const db = makeDb({
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([older, newer]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    })
    mockGetDb.mockReturnValue(db as ReturnType<typeof getDb>)

    const result = await calculateQCRAG()
    // newer run is PASSING — older rejected run should be ignored
    expect(result.status).toBe('GREEN')
  })

  it('returns AMBER on db error', async () => {
    mockGetDb.mockReturnValue(makeDb({
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockRejectedValue(new Error('db fail')),
      },
    }) as ReturnType<typeof getDb>)

    const result = await calculateQCRAG()
    expect(result.status).toBe('AMBER')
  })
})

// ---------------------------------------------------------------------------
// getFullRAGStatus — overall worst status
// ---------------------------------------------------------------------------

describe('getFullRAGStatus', () => {
  it('overall status is RED when any dimension is RED', async () => {
    // Personnel RED (0 staff below min 2), Equipment GREEN, Supplies GREEN, QC GREEN
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue([]) },
      instruments: {
        toArray: vi.fn().mockResolvedValue([
          { id: 'i1', name: 'A', status: 'IN_SERVICE', outOfServiceReason: null, updatedAt: '' },
        ]),
      },
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([
          { analyte: 'G', loincCode: '1', runDate: new Date().toISOString(), observedValue: 5.0, targetMean: 5.0, targetSd: 0.2 },
        ]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    }) as ReturnType<typeof getDb>)
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'S', category: 'Reagent', currentStock: 100, unit: 'mL', reorderThreshold: 5, criticalThreshold: 2, dailyUsageEstimate: 1, lastUpdated: '', updatedBy: '' },
    ])

    const state = await getFullRAGStatus()
    expect(state.overallStatus).toBe('RED')
    expect(state.personnel.status).toBe('RED')
  })

  it('overall status is GREEN when all dimensions are GREEN', async () => {
    const sessions = [
      { techId: 'a', status: 'ACTIVE', startedAt: '', endedAt: null },
      { techId: 'b', status: 'ACTIVE', startedAt: '', endedAt: null },
      { techId: 'c', status: 'ACTIVE', startedAt: '', endedAt: null },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
      instruments: {
        toArray: vi.fn().mockResolvedValue([
          { id: 'i1', name: 'A', status: 'IN_SERVICE', outOfServiceReason: null, updatedAt: '' },
        ]),
      },
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([
          { analyte: 'G', loincCode: '1', runDate: new Date().toISOString(), observedValue: 5.0, targetMean: 5.0, targetSd: 0.2 },
        ]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    }) as ReturnType<typeof getDb>)
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'S', category: 'Reagent', currentStock: 100, unit: 'mL', reorderThreshold: 5, criticalThreshold: 2, dailyUsageEstimate: 1, lastUpdated: '', updatedBy: '' },
    ])

    const state = await getFullRAGStatus()
    expect(state.overallStatus).toBe('GREEN')
  })

  it('overall is AMBER when worst dimension is AMBER', async () => {
    // 2 active = minimum = AMBER; equipment GREEN; supplies GREEN; QC GREEN
    const sessions = [
      { techId: 'a', status: 'ACTIVE', startedAt: '', endedAt: null },
      { techId: 'b', status: 'ACTIVE', startedAt: '', endedAt: null },
    ]
    mockGetDb.mockReturnValue(makeDb({
      shift_sessions: { toArray: vi.fn().mockResolvedValue(sessions) },
      instruments: {
        toArray: vi.fn().mockResolvedValue([
          { id: 'i1', name: 'A', status: 'IN_SERVICE', outOfServiceReason: null, updatedAt: '' },
        ]),
      },
      qcRuns: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([
          { analyte: 'G', loincCode: '1', runDate: new Date().toISOString(), observedValue: 5.0, targetMean: 5.0, targetSd: 0.2 },
        ]),
      },
      driftAlerts: {
        filter: vi.fn().mockReturnThis(),
        toArray: vi.fn().mockResolvedValue([]),
      },
    }) as ReturnType<typeof getDb>)
    mockGetAllSupplyItems.mockResolvedValue([
      { id: '1', name: 'S', category: 'Reagent', currentStock: 100, unit: 'mL', reorderThreshold: 5, criticalThreshold: 2, dailyUsageEstimate: 1, lastUpdated: '', updatedBy: '' },
    ])

    const state = await getFullRAGStatus()
    expect(state.overallStatus).toBe('AMBER')
  })
})

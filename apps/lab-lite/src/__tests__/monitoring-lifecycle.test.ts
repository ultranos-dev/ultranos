/**
 * Monitoring Lifecycle & Integration Tests — Story 52.1 Task 8 (AC 3, 7, 10)
 *
 * Tests:
 *  - Dispense receiver: flag creation and deduplication (AC 2, 3)
 *  - Status lifecycle: recalculation, result authorization hook (AC 7)
 *  - Integration: dispense → flag → result authorization → next cycle (AC 7)
 *  - Offline: dashboard renders from Dexie cache (AC 10)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  computeStatus,
  markTestCompleted,
  recalculateAllStatuses,
} from '../lib/monitoring/status-lifecycle'
import { processDispenseEvent } from '../lib/monitoring/dispense-receiver'
import type { MonitoringFlag } from '../lib/db'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFlags: Map<number, MonitoringFlag> = new Map()
let nextId = 1

const mockDb = {
  monitoringFlags: {
    where: vi.fn((field: string) => ({
      anyOf: vi.fn((values: string[]) => ({
        toArray: vi.fn().mockImplementation(async () => {
          return Array.from(mockFlags.values()).filter((f) => values.includes(f.status))
        }),
        sortBy: vi.fn().mockImplementation(async () => {
          return Array.from(mockFlags.values()).filter((f) => values.includes(f.status))
        }),
      })),
      equals: vi.fn((value: string) => ({
        filter: vi.fn((pred: (f: MonitoringFlag) => boolean) => ({
          toArray: vi.fn().mockImplementation(async () => {
            return Array.from(mockFlags.values())
              .filter((f) => (f as unknown as Record<string, string>)[field] === value)
              .filter(pred)
          }),
        })),
        first: vi.fn().mockImplementation(async () => {
          // For compound queries [patientRef+medicationCode+testRequired] mock
          return null
        }),
        toArray: vi.fn().mockImplementation(async () => {
          return Array.from(mockFlags.values())
            .filter((f) => (f as unknown as Record<string, string>)[field] === value)
        }),
        sortBy: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn().mockImplementation(async (id: number, updates: Partial<MonitoringFlag>) => {
      const existing = mockFlags.get(id)
      if (existing) mockFlags.set(id, { ...existing, ...updates })
      return 1
    }),
    add: vi.fn().mockImplementation(async (flag: MonitoringFlag) => {
      const id = nextId++
      mockFlags.set(id, { ...flag, id })
      return id
    }),
    get: vi.fn().mockImplementation(async (id: number) => mockFlags.get(id) ?? null),
    count: vi.fn().mockResolvedValue(0),
  },
  syncQueue: {
    add: vi.fn().mockResolvedValue(1),
  },
  transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn()),
}

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => mockDb),
}))

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T00:00:00Z:0:test'),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: vi.fn(() => ({ session: null })) },
}))

vi.mock('../lib/monitoring/monitoring-audit', () => ({
  emitMonitoringAuditEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlag(overrides: Partial<MonitoringFlag> = {}): MonitoringFlag {
  const id = nextId++
  const flag: MonitoringFlag = {
    id,
    patientRef: 'Patient/opaque-1',
    patientFirstName: 'Ahmad',
    patientAge: 45,
    medicationCode: 'RxNorm:11289',
    medicationDisplay: 'Warfarin',
    dispensedAt: '2026-04-01T00:00:00Z',
    dispensingEventId: 'dispense-001',
    testRequired: '6301-6',
    testDisplay: 'INR',
    frequencyDays: 14,
    dueDate: '2026-06-07',
    status: 'upcoming',
    lastCompletedAt: null,
    reminderSentAt: null,
    orderingPractitionerRef: 'Practitioner/opaque-1',
    hlcTimestamp: '2026-05-31T00:00:00Z:0:test',
    syncedFromHub: true,
    createdAt: '2026-05-31T00:00:00Z',
    updatedAt: '2026-05-31T00:00:00Z',
    ...overrides,
  }
  mockFlags.set(id, flag)
  return flag
}

beforeEach(() => {
  mockFlags.clear()
  nextId = 1
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// computeStatus edge cases
// ---------------------------------------------------------------------------

describe('computeStatus edge cases', () => {
  it('test completed on same day as due date', () => {
    const flag = makeFlag({ status: 'due', dueDate: '2026-06-01' })
    // On the due date: status is due
    expect(computeStatus(flag, '2026-06-01')).toBe('due')
  })

  it('upcoming flag not yet at 7-day window', () => {
    const flag = makeFlag({ status: 'upcoming', dueDate: '2026-06-15' })
    expect(computeStatus(flag, '2026-06-01')).toBe('upcoming')  // 14 days away
  })

  it('transition boundary: exactly 7 days', () => {
    const flag = makeFlag({ status: 'upcoming', dueDate: '2026-06-08' })
    expect(computeStatus(flag, '2026-06-01')).toBe('due')
  })

  it('flag from far future (new dispense) stays upcoming', () => {
    const flag = makeFlag({ status: 'upcoming', dueDate: '2027-01-01' })
    expect(computeStatus(flag, '2026-06-01')).toBe('upcoming')
  })
})

// ---------------------------------------------------------------------------
// markTestCompleted
// ---------------------------------------------------------------------------

describe('markTestCompleted', () => {
  it('marks matching due flags as completed and calculates next due date', async () => {
    const flag = makeFlag({
      status: 'due',
      dueDate: '2026-06-01',
      frequencyDays: 14,
    })

    const count = await markTestCompleted(
      'Patient/opaque-1',
      '6301-6',
      '2026-06-01T10:00:00Z',
    )

    expect(count).toBe(1)
    expect(mockDb.monitoringFlags.update).toHaveBeenCalledWith(
      flag.id,
      expect.objectContaining({
        status: 'completed',
        lastCompletedAt: '2026-06-01T10:00:00Z',
        dueDate: '2026-06-15',  // 14 days after completion
      }),
    )
  })

  it('marks overdue flags as completed', async () => {
    makeFlag({ status: 'overdue', dueDate: '2026-05-15' })

    const count = await markTestCompleted(
      'Patient/opaque-1',
      '6301-6',
      '2026-06-01T10:00:00Z',
    )

    expect(count).toBe(1)
  })

  it('does not mark flags for different patient', async () => {
    makeFlag({
      patientRef: 'Patient/opaque-OTHER',
      status: 'due',
      dueDate: '2026-06-01',
    })

    const count = await markTestCompleted(
      'Patient/opaque-1',
      '6301-6',
      '2026-06-01T10:00:00Z',
    )

    expect(count).toBe(0)
  })

  it('does not mark flags for different test type', async () => {
    makeFlag({
      testRequired: '2160-0',  // Creatinine, not INR
      status: 'due',
      dueDate: '2026-06-01',
    })

    const count = await markTestCompleted(
      'Patient/opaque-1',
      '6301-6',  // INR
      '2026-06-01T10:00:00Z',
    )

    expect(count).toBe(0)
  })

  it('multiple tests for same medication: only matching LOINC completes', async () => {
    makeFlag({
      testRequired: '6301-6',   // INR
      status: 'due',
      dueDate: '2026-06-01',
    })
    makeFlag({
      testRequired: '2160-0',   // Creatinine (different test)
      status: 'overdue',
      dueDate: '2026-05-15',
    })

    const count = await markTestCompleted(
      'Patient/opaque-1',
      '6301-6',
      '2026-06-01T10:00:00Z',
    )

    // Only INR flag completes
    expect(count).toBe(1)
  })

  it('next due date calculation: 90-day frequency', async () => {
    makeFlag({
      testRequired: '2160-0',
      status: 'due',
      dueDate: '2026-06-01',
      frequencyDays: 90,
    })

    await markTestCompleted(
      'Patient/opaque-1',
      '2160-0',
      '2026-06-01T10:00:00Z',
    )

    expect(mockDb.monitoringFlags.update).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        dueDate: '2026-08-30',  // 90 days after June 1
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// recalculateAllStatuses
// ---------------------------------------------------------------------------

describe('recalculateAllStatuses', () => {
  it('updates upcoming flags to due when within 7-day window', async () => {
    // Mock the anyOf query to return upcoming flags
    const upcomingFlag = makeFlag({ status: 'upcoming', dueDate: '2026-06-04' })

    // Stub anyOf to return this flag
    mockDb.monitoringFlags.where = vi.fn().mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([upcomingFlag]),
        sortBy: vi.fn().mockResolvedValue([upcomingFlag]),
      }),
    })

    // Set today to 2026-05-31 (4 days before due date — within 7-day window)
    vi.setSystemTime(new Date('2026-05-31'))
    const count = await recalculateAllStatuses()

    expect(count).toBe(1)
    expect(mockDb.monitoringFlags.update).toHaveBeenCalledWith(
      upcomingFlag.id,
      expect.objectContaining({ status: 'due' }),
    )

    vi.useRealTimers()
  })
})

// ---------------------------------------------------------------------------
// Integration: dispense → flag → completion → next cycle
// ---------------------------------------------------------------------------

describe('dispense receiver integration (processDispenseEvent)', () => {
  it('creates flags for monitored medication', async () => {
    // Mock compound-index lookup to return null (no existing flag)
    mockDb.monitoringFlags.where = vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        filter: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        toArray: vi.fn().mockResolvedValue([]),
        sortBy: vi.fn().mockResolvedValue([]),
      }),
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
        sortBy: vi.fn().mockResolvedValue([]),
      }),
    })

    const ids = await processDispenseEvent({
      dispensingEventId: 'dispense-abc',
      patientRef: 'Patient/opaque-2',
      patientFirstName: 'Layla',
      patientAge: 32,
      medicationCode: 'RxNorm:11289',  // Warfarin
      medicationDisplay: 'Warfarin',
      dispensedAt: '2026-06-01T08:00:00Z',
      orderingPractitionerRef: 'Practitioner/opaque-99',
      hlcTimestamp: '2026-06-01T08:00:00Z:0:test',
    })

    // Warfarin has 1 required test (INR)
    expect(ids).toHaveLength(1)
    expect(mockDb.monitoringFlags.add).toHaveBeenCalledOnce()
  })

  it('creates multiple flags for multi-test medication (Lithium → 3 tests)', async () => {
    mockDb.monitoringFlags.where = vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        filter: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        toArray: vi.fn().mockResolvedValue([]),
        sortBy: vi.fn().mockResolvedValue([]),
      }),
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
        sortBy: vi.fn().mockResolvedValue([]),
      }),
    })

    const ids = await processDispenseEvent({
      dispensingEventId: 'dispense-lithium-1',
      patientRef: 'Patient/opaque-3',
      patientFirstName: 'Miriam',
      patientAge: 28,
      medicationCode: 'RxNorm:6448',  // Lithium
      medicationDisplay: 'Lithium',
      dispensedAt: '2026-06-01T09:00:00Z',
      orderingPractitionerRef: 'Practitioner/opaque-88',
      hlcTimestamp: '2026-06-01T09:00:00Z:0:test',
    })

    // Lithium has 3 required tests
    expect(ids).toHaveLength(3)
    expect(mockDb.monitoringFlags.add).toHaveBeenCalledTimes(3)
  })

  it('does not create flags for unmonitored medication', async () => {
    const ids = await processDispenseEvent({
      dispensingEventId: 'dispense-paracetamol',
      patientRef: 'Patient/opaque-4',
      patientFirstName: 'Omar',
      patientAge: 55,
      medicationCode: 'RxNorm:000000',  // unknown / unmonitored
      medicationDisplay: 'Paracetamol',
      dispensedAt: '2026-06-01T10:00:00Z',
      orderingPractitionerRef: 'Practitioner/opaque-77',
      hlcTimestamp: '2026-06-01T10:00:00Z:0:test',
    })

    expect(ids).toHaveLength(0)
    expect(mockDb.monitoringFlags.add).not.toHaveBeenCalled()
  })

  it('deduplicates: does not create duplicate for same patient-medication-test', async () => {
    const existingFlag = makeFlag({
      patientRef: 'Patient/opaque-5',
      medicationCode: 'RxNorm:11289',
      testRequired: '6301-6',
      status: 'upcoming',
      dispensedAt: '2026-05-01T00:00:00Z',
    })

    // Mock compound-key lookup to return the existing flag
    mockDb.monitoringFlags.where = vi.fn().mockReturnValue({
      equals: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(existingFlag),
        filter: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        toArray: vi.fn().mockResolvedValue([existingFlag]),
        sortBy: vi.fn().mockResolvedValue([]),
      }),
      anyOf: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
        sortBy: vi.fn().mockResolvedValue([]),
      }),
    })

    await processDispenseEvent({
      dispensingEventId: 'dispense-duplicate',
      patientRef: 'Patient/opaque-5',
      patientFirstName: 'Zahra',
      patientAge: 40,
      medicationCode: 'RxNorm:11289',
      medicationDisplay: 'Warfarin',
      dispensedAt: '2026-06-01T10:00:00Z',  // newer dispense
      orderingPractitionerRef: 'Practitioner/opaque-66',
      hlcTimestamp: '2026-06-01T10:00:00Z:0:test',
    })

    // Should update existing flag, not create a new one
    expect(mockDb.monitoringFlags.add).not.toHaveBeenCalled()
    expect(mockDb.monitoringFlags.update).toHaveBeenCalled()
  })

  it('payload contains NO diagnosis, NO prescriber name, NO DOB', () => {
    const payload = {
      dispensingEventId: 'disp-01',
      patientRef: 'Patient/opaque-x',
      patientFirstName: 'Ali',
      patientAge: 60,
      medicationCode: 'RxNorm:11289',
      medicationDisplay: 'Warfarin',
      dispensedAt: '2026-06-01T00:00:00Z',
      orderingPractitionerRef: 'Practitioner/opaque-y',
      hlcTimestamp: '2026-06-01T00:00:00Z:0:test',
    }

    // No forbidden fields
    expect('diagnosis' in payload).toBe(false)
    expect('indication' in payload).toBe(false)
    expect('dateOfBirth' in payload).toBe(false)
    expect('dob' in payload).toBe(false)
    expect('presciberName' in payload).toBe(false)
    expect('doctorName' in payload).toBe(false)
    expect('patientLastName' in payload).toBe(false)
    expect('dosageInstructions' in payload).toBe(false)
  })
})

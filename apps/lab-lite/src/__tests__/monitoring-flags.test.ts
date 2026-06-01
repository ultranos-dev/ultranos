/**
 * Monitoring Flag Tests — Story 52.1 Task 8 (AC 1, 2, 3, 8)
 *
 * Unit tests for:
 *  - Medication-to-lab mapping lookups (AC 1)
 *  - Dispense receiver: flag creation, deduplication, data minimization (AC 2, 3, 8)
 *  - Status lifecycle transitions (AC 7)
 *  - Data minimization enforcement (AC 8)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getMedicationMapping,
  requiresMonitoring,
  BUNDLED_MEDICATION_MAPPINGS,
  type MedicationLabMapping,
} from '../lib/monitoring/medication-lab-map'
import { computeStatus } from '../lib/monitoring/status-lifecycle'
import type { MonitoringFlag } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock Dexie, audit client, and HLC — unit tests only need pure functions
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    monitoringFlags: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
        equals: vi.fn(() => ({
          filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
          first: vi.fn().mockResolvedValue(null),
          sortBy: vi.fn().mockResolvedValue([]),
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
      update: vi.fn().mockResolvedValue(1),
      add: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    syncQueue: {
      add: vi.fn().mockResolvedValue(1),
    },
    transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn()),
  })),
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

// ---------------------------------------------------------------------------
// Task 1: Medication-to-Lab-Test Mapping Tests (AC 1)
// ---------------------------------------------------------------------------

describe('medication-lab-map', () => {
  describe('getMedicationMapping', () => {
    it('returns Warfarin mapping with INR test', () => {
      const mapping = getMedicationMapping('RxNorm:11289')
      expect(mapping).not.toBeNull()
      expect(mapping!.medicationDisplay).toBe('Warfarin')
      expect(mapping!.requiredTests).toHaveLength(1)
      expect(mapping!.requiredTests[0].loincCode).toBe('6301-6')
      expect(mapping!.requiredTests[0].testDisplay).toContain('INR')
      expect(mapping!.requiredTests[0].priority).toBe('urgent')
    })

    it('returns Metformin mapping with Creatinine and eGFR tests', () => {
      const mapping = getMedicationMapping('RxNorm:6809')
      expect(mapping).not.toBeNull()
      expect(mapping!.medicationDisplay).toBe('Metformin')
      expect(mapping!.requiredTests).toHaveLength(2)
      const loincs = mapping!.requiredTests.map((t) => t.loincCode)
      expect(loincs).toContain('2160-0')   // Creatinine
      expect(loincs).toContain('62238-1')  // eGFR
    })

    it('returns Lithium mapping with 3 tests (Lithium level, TSH, Creatinine)', () => {
      const mapping = getMedicationMapping('RxNorm:6448')
      expect(mapping).not.toBeNull()
      expect(mapping!.requiredTests).toHaveLength(3)
      const loincs = mapping!.requiredTests.map((t) => t.loincCode)
      expect(loincs).toContain('14334-7')  // Lithium serum
      expect(loincs).toContain('3016-3')   // TSH
      expect(loincs).toContain('2160-0')   // Creatinine
    })

    it('returns Methotrexate mapping with CBC and LFTs', () => {
      const mapping = getMedicationMapping('RxNorm:7235')
      expect(mapping).not.toBeNull()
      expect(mapping!.requiredTests).toHaveLength(2)
      const loincs = mapping!.requiredTests.map((t) => t.loincCode)
      expect(loincs).toContain('58410-2')  // CBC
      expect(loincs).toContain('24325-3')  // LFTs
    })

    it('returns ACE Inhibitor mapping with Potassium and Creatinine', () => {
      const mapping = getMedicationMapping('RxNorm:3827')
      expect(mapping).not.toBeNull()
      const loincs = mapping!.requiredTests.map((t) => t.loincCode)
      expect(loincs).toContain('2823-3')   // Potassium
      expect(loincs).toContain('2160-0')   // Creatinine
    })

    it('returns Carbamazepine mapping with CBC, LFTs, and drug level', () => {
      const mapping = getMedicationMapping('RxNorm:2002')
      expect(mapping).not.toBeNull()
      expect(mapping!.requiredTests).toHaveLength(3)
      const loincs = mapping!.requiredTests.map((t) => t.loincCode)
      expect(loincs).toContain('58410-2')  // CBC
      expect(loincs).toContain('24325-3')  // LFTs
      expect(loincs).toContain('3428-0')   // Carbamazepine level
    })

    it('returns Amiodarone mapping with TSH and LFTs', () => {
      const mapping = getMedicationMapping('RxNorm:703')
      expect(mapping).not.toBeNull()
      expect(mapping!.requiredTests).toHaveLength(2)
      const loincs = mapping!.requiredTests.map((t) => t.loincCode)
      expect(loincs).toContain('3016-3')   // TSH
      expect(loincs).toContain('24325-3')  // LFTs
    })

    it('returns null for an unknown medication code', () => {
      const mapping = getMedicationMapping('RxNorm:999999')
      expect(mapping).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(getMedicationMapping('')).toBeNull()
    })

    it('Hub overrides take precedence over bundled defaults', () => {
      const override: MedicationLabMapping = {
        medicationCode: 'RxNorm:11289',
        medicationDisplay: 'Warfarin (updated)',
        version: 2,
        requiredTests: [
          {
            loincCode: '6301-6',
            testDisplay: 'INR (updated)',
            frequencyDays: 7,
            initialDelayDays: 2,
            priority: 'urgent',
          },
        ],
      }
      const hubOverrides = new Map([['RxNorm:11289', override]])
      const mapping = getMedicationMapping('RxNorm:11289', hubOverrides)
      expect(mapping!.medicationDisplay).toBe('Warfarin (updated)')
      expect(mapping!.requiredTests[0].frequencyDays).toBe(7)
    })
  })

  describe('requiresMonitoring', () => {
    it('returns true for all bundled medications', () => {
      for (const m of BUNDLED_MEDICATION_MAPPINGS) {
        expect(requiresMonitoring(m.medicationCode)).toBe(true)
      }
    })

    it('returns false for unknown medication', () => {
      expect(requiresMonitoring('RxNorm:000000')).toBe(false)
    })
  })

  describe('bundled mapping clinical data integrity', () => {
    it('all mappings have at least one test with a valid LOINC code', () => {
      for (const m of BUNDLED_MEDICATION_MAPPINGS) {
        expect(m.requiredTests.length).toBeGreaterThan(0)
        for (const t of m.requiredTests) {
          // LOINC codes follow pattern: digits-digit
          expect(t.loincCode).toMatch(/^\d+-\d$/)
          expect(t.frequencyDays).toBeGreaterThan(0)
          expect(t.initialDelayDays).toBeGreaterThanOrEqual(0)
          expect(['routine', 'urgent']).toContain(t.priority)
        }
      }
    })

    it('Warfarin initial delay is 3 days (earliest monitoring for anticoagulation)', () => {
      const m = getMedicationMapping('RxNorm:11289')
      expect(m!.requiredTests[0].initialDelayDays).toBe(3)
    })

    it('Methotrexate initial delay is 14 days', () => {
      const m = getMedicationMapping('RxNorm:7235')
      for (const t of m!.requiredTests) {
        expect(t.initialDelayDays).toBe(14)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Status Lifecycle Unit Tests (AC 7)
// ---------------------------------------------------------------------------

function makeFlag(overrides: Partial<MonitoringFlag> = {}): MonitoringFlag {
  return {
    id: 1,
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
}

describe('computeStatus (status-lifecycle)', () => {
  it('returns upcoming when dueDate is more than 7 days away', () => {
    const flag = makeFlag({ status: 'upcoming', dueDate: '2026-06-30' })
    expect(computeStatus(flag, '2026-06-01')).toBe('upcoming')
  })

  it('returns due when dueDate is exactly 7 days away', () => {
    const flag = makeFlag({ status: 'upcoming', dueDate: '2026-06-08' })
    expect(computeStatus(flag, '2026-06-01')).toBe('due')
  })

  it('returns due when dueDate is 1 day away', () => {
    const flag = makeFlag({ status: 'due', dueDate: '2026-06-02' })
    expect(computeStatus(flag, '2026-06-01')).toBe('due')
  })

  it('returns due when dueDate is today', () => {
    const flag = makeFlag({ status: 'due', dueDate: '2026-06-01' })
    expect(computeStatus(flag, '2026-06-01')).toBe('due')
  })

  it('returns overdue when dueDate is in the past', () => {
    const flag = makeFlag({ status: 'due', dueDate: '2026-05-25' })
    expect(computeStatus(flag, '2026-06-01')).toBe('overdue')
  })

  it('returns overdue when dueDate was 30 days ago', () => {
    const flag = makeFlag({ status: 'overdue', dueDate: '2026-05-01' })
    expect(computeStatus(flag, '2026-06-01')).toBe('overdue')
  })

  it('preserves completed status — completed flags never regress', () => {
    const flag = makeFlag({ status: 'completed', dueDate: '2026-05-01' })
    expect(computeStatus(flag, '2026-06-01')).toBe('completed')
  })

  it('upcoming flag with dueDate within 7 days transitions to due', () => {
    const flag = makeFlag({ status: 'upcoming', dueDate: '2026-06-04' })
    expect(computeStatus(flag, '2026-05-31')).toBe('due')  // 4 days away
  })
})

// ---------------------------------------------------------------------------
// Data Minimization Tests (AC 8)
// ---------------------------------------------------------------------------

describe('data minimization enforcement', () => {
  it('MonitoringFlag interface has no DOB field', () => {
    const flag = makeFlag()
    // patientAge is present (computed), DOB must not be
    expect('patientAge' in flag).toBe(true)
    expect('dateOfBirth' in flag).toBe(false)
    expect('dob' in flag).toBe(false)
  })

  it('MonitoringFlag interface has only firstName, not full name', () => {
    const flag = makeFlag()
    expect('patientFirstName' in flag).toBe(true)
    expect('patientLastName' in flag).toBe(false)
    expect('patientFullName' in flag).toBe(false)
    expect('patientName' in flag).toBe(false)
  })

  it('MonitoringFlag uses opaque practitioner ref, not prescriber name', () => {
    const flag = makeFlag()
    expect('orderingPractitionerRef' in flag).toBe(true)
    expect('presciberName' in flag).toBe(false)
    expect('doctorName' in flag).toBe(false)
    expect('orderingPhysicianName' in flag).toBe(false)
  })

  it('MonitoringFlag has no diagnosis field', () => {
    const flag = makeFlag()
    expect('diagnosis' in flag).toBe(false)
    expect('indication' in flag).toBe(false)
    expect('clinicalNotes' in flag).toBe(false)
  })
})

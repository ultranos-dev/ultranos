/**
 * Story 46.3 — Competency Self-Assessment & Skill Decay Detection
 * Tests for competency-tracker.ts
 *
 * AC covered: 1 (decay notification threshold), 2 (green/yellow/red status),
 *             6 (no patient data in tracked records)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  daysBetween,
  resolveStatus,
  updateCompetencyFromResult,
  recalculateAllCompetencies,
} from '../lib/competency-tracker'
import type { ProcedureCompetency } from '../lib/competency-types'
import { DEFAULT_DECAY_THRESHOLD_DAYS, DEFAULT_RED_THRESHOLD_DAYS } from '../lib/competency-types'

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------

const mockProcedureCompetencies: ProcedureCompetency[] = []
const mockLabResults: any[] = []

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getDb: () => ({
      procedure_competencies: {
        put: async (record: ProcedureCompetency) => {
          const idx = mockProcedureCompetencies.findIndex((r) => r.id === record.id)
          if (idx >= 0) mockProcedureCompetencies[idx] = record
          else mockProcedureCompetencies.push(record)
        },
        update: async (id: string, changes: Partial<ProcedureCompetency>) => {
          const idx = mockProcedureCompetencies.findIndex((r) => r.id === id)
          if (idx >= 0) Object.assign(mockProcedureCompetencies[idx], changes)
        },
        bulkPut: async (records: ProcedureCompetency[]) => {
          for (const r of records) {
            const idx = mockProcedureCompetencies.findIndex((x) => x.id === r.id)
            if (idx >= 0) mockProcedureCompetencies[idx] = r
            else mockProcedureCompetencies.push(r)
          }
        },
        where: (key: string) => ({
          equals: (val: any) => ({
            first: async () => {
              if (key === '[technicianId+procedureRef]') {
                return mockProcedureCompetencies.find(
                  (r) => r.technicianId === val[0] && r.procedureRef === val[1],
                )
              }
              return mockProcedureCompetencies.find((r) => (r as any)[key] === val)
            },
            toArray: async () =>
              mockProcedureCompetencies.filter((r) => (r as any)[key] === val),
          }),
        }),
      },
      lab_results: {
        where: (key: string) => ({
          equals: (val: any) => ({
            filter: (fn: any) => ({
              toArray: async () =>
                mockLabResults.filter((r) => (r as any)[key] === val).filter(fn),
              count: async () =>
                mockLabResults.filter((r) => (r as any)[key] === val).filter(fn).length,
            }),
            toArray: async () =>
              mockLabResults.filter((r) => (r as any)[key] === val),
          }),
        }),
      },
    }),
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(techId: string, loincCode: string, daysAgo: number): any {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return {
    id: crypto.randomUUID(),
    loincCode,
    loincDisplay: 'CBC',
    enteredBy: techId,
    enteredAt: d.toISOString(),
    status: 'final',
  }
}

beforeEach(() => {
  mockProcedureCompetencies.length = 0
  mockLabResults.length = 0
})

// ---------------------------------------------------------------------------
// Unit tests: daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns 0 for same timestamp', () => {
    const t = new Date().toISOString()
    expect(daysBetween(t, t)).toBe(0)
  })

  it('returns correct whole days for 45 days ago', () => {
    const later = new Date()
    const earlier = new Date()
    earlier.setDate(earlier.getDate() - 45)
    expect(daysBetween(earlier.toISOString(), later.toISOString())).toBe(45)
  })

  it('returns Infinity for null lastPerformedAt', () => {
    expect(daysBetween(null, new Date().toISOString())).toBe(Infinity)
  })
})

// ---------------------------------------------------------------------------
// Unit tests: resolveStatus (AC: 2)
// ---------------------------------------------------------------------------

describe('resolveStatus', () => {
  const decay = DEFAULT_DECAY_THRESHOLD_DAYS   // 45
  const red   = DEFAULT_RED_THRESHOLD_DAYS     // 90

  it('returns active when performed within threshold (0 days)', () => {
    expect(resolveStatus(0, decay, red)).toBe('active')
  })

  it('returns active at exactly decayThresholdDays', () => {
    expect(resolveStatus(45, decay, red)).toBe('active')
  })

  it('returns decay_risk when between 45 and 90 days', () => {
    expect(resolveStatus(46, decay, red)).toBe('decay_risk')
    expect(resolveStatus(89, decay, red)).toBe('decay_risk')
  })

  it('returns decay_risk at exactly redThresholdDays', () => {
    expect(resolveStatus(90, decay, red)).toBe('decay_risk')
  })

  it('returns decayed when > 90 days', () => {
    expect(resolveStatus(91, decay, red)).toBe('decayed')
    expect(resolveStatus(365, decay, red)).toBe('decayed')
  })

  it('returns decayed for Infinity (never performed)', () => {
    expect(resolveStatus(Infinity, decay, red)).toBe('decayed')
  })

  it('respects custom thresholds', () => {
    // custom: yellow at 30, red at 60
    expect(resolveStatus(25, 30, 60)).toBe('active')
    expect(resolveStatus(35, 30, 60)).toBe('decay_risk')
    expect(resolveStatus(65, 30, 60)).toBe('decayed')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: updateCompetencyFromResult (AC: 1)
// ---------------------------------------------------------------------------

describe('updateCompetencyFromResult', () => {
  it('creates a new competency record on first result', async () => {
    mockLabResults.push(makeResult('tech-1', '58410-2', 0))
    await updateCompetencyFromResult('tech-1', '58410-2', 'CBC', new Date().toISOString())

    expect(mockProcedureCompetencies).toHaveLength(1)
    const rec = mockProcedureCompetencies[0]
    expect(rec.technicianId).toBe('tech-1')
    expect(rec.procedureRef).toBe('58410-2')
    expect(rec.procedureName).toBe('CBC')
    expect(rec.totalPerformed).toBe(1)
    expect(rec.status).toBe('active')
  })

  it('increments totalPerformed on subsequent results', async () => {
    // Seed an existing record
    const existing: ProcedureCompetency = {
      id: 'comp-1',
      technicianId: 'tech-1',
      procedureRef: '58410-2',
      procedureName: 'CBC',
      lastPerformedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
      totalPerformed: 3,
      performedLast90Days: 3,
      status: 'active',
      decayThresholdDays: 45,
      redThresholdDays: 90,
      updatedAt: new Date().toISOString(),
    }
    mockProcedureCompetencies.push(existing)
    mockLabResults.push(makeResult('tech-1', '58410-2', 0))

    await updateCompetencyFromResult('tech-1', '58410-2', 'CBC', new Date().toISOString())

    expect(mockProcedureCompetencies[0].totalPerformed).toBe(4)
  })

  it('stores no patient data — only technicianId + procedureRef + counts', async () => {
    mockLabResults.push(makeResult('tech-2', '2345-7', 0))
    await updateCompetencyFromResult('tech-2', '2345-7', 'Glucose', new Date().toISOString())

    const rec = mockProcedureCompetencies[0]
    // Verify no PHI fields exist
    expect((rec as any).patientRef).toBeUndefined()
    expect((rec as any).sampleId).toBeUndefined()
    expect((rec as any).resultValue).toBeUndefined()
    // Only safe identifiers
    expect(rec.technicianId).toBe('tech-2')
    expect(rec.procedureRef).toBe('2345-7')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: recalculateAllCompetencies (AC: 2)
// ---------------------------------------------------------------------------

describe('recalculateAllCompetencies', () => {
  it('correctly classifies green, yellow, red procedures', async () => {
    const techId = 'tech-3'

    // green: performed today
    mockLabResults.push(makeResult(techId, 'GREEN-LOINC', 0))
    // yellow: performed 60 days ago
    mockLabResults.push(makeResult(techId, 'YELLOW-LOINC', 60))
    // red: performed 100 days ago
    mockLabResults.push(makeResult(techId, 'RED-LOINC', 100))

    const results = await recalculateAllCompetencies(techId)
    const byRef = Object.fromEntries(results.map((r) => [r.procedureRef, r]))

    expect(byRef['GREEN-LOINC'].status).toBe('active')
    expect(byRef['YELLOW-LOINC'].status).toBe('decay_risk')
    expect(byRef['RED-LOINC'].status).toBe('decayed')
  })

  it('counts performedLast90Days correctly', async () => {
    const techId = 'tech-4'
    // 3 results within 90 days, 2 older
    mockLabResults.push(makeResult(techId, 'CBC-001', 5))
    mockLabResults.push(makeResult(techId, 'CBC-001', 30))
    mockLabResults.push(makeResult(techId, 'CBC-001', 89))
    mockLabResults.push(makeResult(techId, 'CBC-001', 95))   // > 90 days
    mockLabResults.push(makeResult(techId, 'CBC-001', 120))  // > 90 days

    const results = await recalculateAllCompetencies(techId)
    const rec = results.find((r) => r.procedureRef === 'CBC-001')!

    expect(rec.totalPerformed).toBe(5)
    expect(rec.performedLast90Days).toBe(3)
  })

  it('preserves existing custom thresholds on recalculation', async () => {
    const techId = 'tech-5'

    // Seed an existing record with custom thresholds
    const custom: ProcedureCompetency = {
      id: 'comp-custom',
      technicianId: techId,
      procedureRef: 'CUSTOM-001',
      procedureName: 'Custom Test',
      lastPerformedAt: null,
      totalPerformed: 0,
      performedLast90Days: 0,
      status: 'decayed',
      decayThresholdDays: 20,  // custom: 20-day yellow threshold
      redThresholdDays: 40,    // custom: 40-day red threshold
      updatedAt: new Date().toISOString(),
    }
    mockProcedureCompetencies.push(custom)

    // Perform the procedure 30 days ago — should be decay_risk with custom thresholds
    mockLabResults.push(makeResult(techId, 'CUSTOM-001', 30))

    const results = await recalculateAllCompetencies(techId)
    const rec = results.find((r) => r.procedureRef === 'CUSTOM-001')!

    expect(rec.decayThresholdDays).toBe(20)
    expect(rec.redThresholdDays).toBe(40)
    expect(rec.status).toBe('decay_risk')
  })
})

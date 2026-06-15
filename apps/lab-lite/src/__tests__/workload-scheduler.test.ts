import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Dexie db calls used by the scheduler
vi.mock('@/lib/db', () => ({
  getTestTimeEstimate: vi.fn(),
  getActiveScheduleForDay: vi.fn(),
}))

import {
  tagPendingTests,
  estimateTotalAnalyzerTime,
  generateSchedule,
  detectTimeWarnings,
  parseTimeToMinutes,
  addMinutesToTime,
  getTestPowerRequirement,
  type PendingOrder,
  type TaggedTest,
  type PowerBudget,
} from '@/lib/workload-scheduler'
import { getTestTimeEstimate, getActiveScheduleForDay } from '@/lib/db'

const mockedGetEstimate = vi.mocked(getTestTimeEstimate)
const mockedGetSchedule = vi.mocked(getActiveScheduleForDay)

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// parseTimeToMinutes / addMinutesToTime
// ---------------------------------------------------------------------------

describe('parseTimeToMinutes', () => {
  it('parses 09:00 to 540', () => {
    expect(parseTimeToMinutes('09:00')).toBe(540)
  })

  it('parses 13:30 to 810', () => {
    expect(parseTimeToMinutes('13:30')).toBe(810)
  })

  it('parses 00:00 to 0', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0)
  })
})

describe('addMinutesToTime', () => {
  it('adds 240 minutes to 09:00 → 13:00', () => {
    expect(addMinutesToTime('09:00', 240)).toBe('13:00')
  })

  it('handles wrap past midnight', () => {
    expect(addMinutesToTime('23:00', 120)).toBe('01:00')
  })
})

// ---------------------------------------------------------------------------
// getTestPowerRequirement
// ---------------------------------------------------------------------------

describe('getTestPowerRequirement', () => {
  it('returns estimate from Dexie for known LOINC codes', async () => {
    mockedGetEstimate.mockResolvedValue({
      loincCode: '58410-2',
      displayName: 'CBC',
      estimatedMinutes: 15,
      requiresPower: true,
      batchSize: 20,
      updatedAt: '2026-01-01T00:00:00Z',
    })

    const result = await getTestPowerRequirement('58410-2')
    expect(result.loincCode).toBe('58410-2')
    expect(result.requiresPower).toBe(true)
  })

  it('returns conservative fallback for unknown LOINC codes', async () => {
    mockedGetEstimate.mockResolvedValue(undefined)
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await getTestPowerRequirement('99999-9')
    expect(result.loincCode).toBe('99999-9')
    expect(result.requiresPower).toBe(true)
    expect(result.estimatedMinutes).toBe(15)
    expect(result.batchSize).toBe(1)
    expect(consoleSpy).toHaveBeenCalledOnce()

    consoleSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// tagPendingTests
// ---------------------------------------------------------------------------

describe('tagPendingTests', () => {
  it('correctly tags known LOINC codes', async () => {
    mockedGetEstimate.mockImplementation(async (code: string) => {
      if (code === '58410-2') {
        return { loincCode: '58410-2', displayName: 'CBC', estimatedMinutes: 15, requiresPower: true, batchSize: 20, updatedAt: '' }
      }
      if (code === '24356-8') {
        return { loincCode: '24356-8', displayName: 'Urinalysis', estimatedMinutes: 5, requiresPower: false, batchSize: 1, updatedAt: '' }
      }
      return undefined
    })

    const orders: PendingOrder[] = [
      { loincCode: '58410-2', urgency: 'routine', patientRef: 'ref-1' },
      { loincCode: '24356-8', urgency: 'routine', patientRef: 'ref-2' },
    ]

    const tagged = await tagPendingTests(orders)
    expect(tagged).toHaveLength(2)
    expect(tagged[0].requiresPower).toBe(true)
    expect(tagged[0].batchSize).toBe(20)
    expect(tagged[1].requiresPower).toBe(false)
    expect(tagged[1].displayName).toBe('Urinalysis')
  })

  it('falls back for unknown codes', async () => {
    mockedGetEstimate.mockResolvedValue(undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    const orders: PendingOrder[] = [
      { loincCode: 'UNKNOWN-1', urgency: 'routine', patientRef: 'ref-1' },
    ]

    const tagged = await tagPendingTests(orders)
    expect(tagged[0].requiresPower).toBe(true)
    expect(tagged[0].estimatedMinutes).toBe(15)
    expect(tagged[0].batchSize).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// estimateTotalAnalyzerTime
// ---------------------------------------------------------------------------

describe('estimateTotalAnalyzerTime', () => {
  it('correctly calculates batch parallelism (25 CBC samples = 2 batches = 30 min)', () => {
    const tests: TaggedTest[] = Array.from({ length: 25 }, (_, i) => ({
      loincCode: '58410-2',
      urgency: 'routine' as const,
      patientRef: `ref-${i}`,
      requiresPower: true,
      estimatedMinutes: 15,
      batchSize: 20,
      displayName: 'CBC',
    }))

    // ceil(25/20) = 2 batches × 15 min = 30 min
    expect(estimateTotalAnalyzerTime(tests)).toBe(30)
  })

  it('handles multiple test types', () => {
    const tests: TaggedTest[] = [
      // 5 CBC: ceil(5/20) = 1 batch × 15 = 15 min
      ...Array.from({ length: 5 }, (_, i) => ({
        loincCode: '58410-2', urgency: 'routine' as const, patientRef: `ref-${i}`,
        requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC',
      })),
      // 12 TSH: ceil(12/8) = 2 batches × 25 = 50 min
      ...Array.from({ length: 12 }, (_, i) => ({
        loincCode: '3016-3', urgency: 'routine' as const, patientRef: `ref-tsh-${i}`,
        requiresPower: true, estimatedMinutes: 25, batchSize: 8, displayName: 'TSH',
      })),
    ]

    // 15 + 50 = 65 min
    expect(estimateTotalAnalyzerTime(tests)).toBe(65)
  })

  it('excludes manual tests from analyzer time', () => {
    const tests: TaggedTest[] = [
      { loincCode: '58410-2', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC' },
      { loincCode: '24356-8', urgency: 'routine', patientRef: 'ref-2', requiresPower: false, estimatedMinutes: 5, batchSize: 1, displayName: 'Urinalysis' },
    ]

    // Only CBC counted: ceil(1/20) * 15 = 15 min
    expect(estimateTotalAnalyzerTime(tests)).toBe(15)
  })

  it('handles batch size of 0 by treating as 1', () => {
    const tests: TaggedTest[] = [
      { loincCode: 'X', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 10, batchSize: 0, displayName: 'Test' },
    ]

    // batchSize clamped to 1: ceil(1/1) * 10 = 10
    expect(estimateTotalAnalyzerTime(tests)).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// generateSchedule
// ---------------------------------------------------------------------------

describe('generateSchedule', () => {
  const budget: PowerBudget = {
    startTime: '09:00',
    endTime: '13:00',
    totalMinutes: 240,
    remainingMinutes: 240,
  }

  it('puts urgent tests first', () => {
    const tests: TaggedTest[] = [
      { loincCode: '57698-3', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 12, batchSize: 10, displayName: 'Lipid Panel' },
      { loincCode: '58410-2', urgency: 'stat', patientRef: 'ref-2', requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC' },
    ]

    const result = generateSchedule(tests, budget)
    expect(result.scheduledGroups[0].loincCode).toBe('58410-2')
    expect(result.scheduledGroups[0].hasUrgent).toBe(true)
  })

  it('puts manual tests last with phase=manual', () => {
    const tests: TaggedTest[] = [
      { loincCode: '58410-2', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC' },
      { loincCode: '24356-8', urgency: 'routine', patientRef: 'ref-2', requiresPower: false, estimatedMinutes: 5, batchSize: 1, displayName: 'Urinalysis' },
    ]

    const result = generateSchedule(tests, budget)
    const manualGroups = result.scheduledGroups.filter((g) => g.phase === 'manual')
    expect(manualGroups).toHaveLength(1)
    expect(manualGroups[0].loincCode).toBe('24356-8')
  })

  it('marks overflow when budget is exceeded', () => {
    const tightBudget: PowerBudget = {
      startTime: '09:00',
      endTime: '09:30',
      totalMinutes: 30,
      remainingMinutes: 30,
    }

    const tests: TaggedTest[] = [
      { loincCode: '58410-2', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC' },
      { loincCode: '3016-3', urgency: 'routine', patientRef: 'ref-2', requiresPower: true, estimatedMinutes: 25, batchSize: 8, displayName: 'TSH' },
    ]

    const result = generateSchedule(tests, tightBudget)
    const overflow = result.scheduledGroups.filter((g) => g.phase === 'overflow')
    expect(overflow).toHaveLength(1)
    expect(overflow[0].loincCode).toBe('3016-3') // TSH doesn't fit
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.warnings[0].severity).toBe('red')
  })

  it('correctly identifies overflow correctly', () => {
    const result = generateSchedule([], budget)
    expect(result.scheduledGroups).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
    expect(result.budget.used).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// detectTimeWarnings
// ---------------------------------------------------------------------------

describe('detectTimeWarnings', () => {
  it('produces warning when current time + batch time exceeds power window end', () => {
    const budget: PowerBudget = {
      startTime: '09:00',
      endTime: '13:00',
      totalMinutes: 240,
      remainingMinutes: 30, // only 30 min left
    }

    const schedule = generateSchedule(
      [
        { loincCode: '58410-2', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC' },
      ],
      budget,
    )

    // Mock current time to 12:50 — 10 min before end
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T12:50:00'))

    const warnings = detectTimeWarnings(schedule, budget)
    // At 12:50 with end at 13:00, group needs 15 min, latest start is 12:45
    // currentMinutes (770) > latestStart (765) → warning
    expect(warnings.length).toBeGreaterThanOrEqual(1)

    vi.useRealTimers()
  })

  it('produces no warnings when plenty of time remains', () => {
    const budget: PowerBudget = {
      startTime: '09:00',
      endTime: '17:00',
      totalMinutes: 480,
      remainingMinutes: 480,
    }

    const schedule = generateSchedule(
      [
        { loincCode: '58410-2', urgency: 'routine', patientRef: 'ref-1', requiresPower: true, estimatedMinutes: 15, batchSize: 20, displayName: 'CBC' },
      ],
      budget,
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-30T09:00:00'))

    const warnings = detectTimeWarnings(schedule, budget)
    expect(warnings).toHaveLength(0)

    vi.useRealTimers()
  })
})

/**
 * Story 46.6 — Certification Pathway Tracker: Engine Tests
 * Task 9 — unit tests for progress calculation, milestone detection
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateProgress,
  detectNewlyCompletedMilestones,
  saveProgressAndDetectCompletions,
} from '../lib/certification-engine'
import type { CertificationPathway, TechnicianProgress } from '../lib/certification-types'
import type { ModuleCompletion } from '../lib/micro-learning-types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TECHNICIAN_ID = 'tech-abc-123'

const PATHWAY: CertificationPathway = {
  id: 'pathway-level1',
  name: 'Level 1 Lab Technician',
  description: 'Foundation pathway',
  milestones: [
    {
      id: 'ms-modules',
      pathwayId: 'pathway-level1',
      name: 'Complete 5 modules',
      description: 'Pass 5 micro-learning assessments',
      category: 'modules',
      requirement: { type: 'count', target: 5 },
      order: 1,
    },
    {
      id: 'ms-hours',
      pathwayId: 'pathway-level1',
      name: '10 education hours',
      description: 'Accumulate 10 hours of learning',
      category: 'education_hours',
      requirement: { type: 'hours', target: 10 },
      order: 2,
    },
    {
      id: 'ms-supervised',
      pathwayId: 'pathway-level1',
      name: '3 supervised procedures',
      description: 'Perform 3 procedures under supervision',
      category: 'supervised_procedures',
      requirement: { type: 'count', target: 3 },
      order: 3,
    },
    {
      id: 'ms-mentorship',
      pathwayId: 'pathway-level1',
      name: 'Active mentorship',
      description: 'Complete 5 mentorship activities',
      category: 'mentorship',
      requirement: { type: 'count', target: 5 },
      order: 4,
    },
  ],
  version: '1.0.0',
  meta: { lastUpdated: '2026-01-01T00:00:00Z', versionId: 'v1' },
}

// ---------------------------------------------------------------------------
// Mock DB state
// ---------------------------------------------------------------------------

let mockModuleCompletions: ModuleCompletion[] = []
let mockModules: { id: string; procedureRef: string; durationMinutes: number }[] = []
let mockSupervisedProcedures: { id: string; technicianId: string; procedureRef: string }[] = []
let mockCheckIns: { id: string; pairingId: string }[] = []
let mockJournals: { id: string; authorId: string; pairingId: string }[] = []
let mockPairings: { id: string; menteeId: string; status: string }[] = []
let mockProgress: Record<string, TechnicianProgress> = {}

vi.mock('../lib/db', () => {
  const makeTable = (dataFn: () => unknown[]) => ({
    where: (field: string) => ({
      equals: (val: unknown) => ({
        toArray: async () => {
          const data = dataFn() as Record<string, unknown>[]
          return data.filter((r) => r[field] === val)
        },
      }),
    }),
    toArray: async () => dataFn(),
    bulkGet: async (ids: string[]) => {
      const data = dataFn() as { id: string }[]
      return ids.map((id) => data.find((d) => d.id === id) ?? undefined)
    },
    get: async (id: string) => {
      const data = dataFn() as { id: string }[]
      return data.find((d) => d.id === id) ?? undefined
    },
    put: async (record: { id: string }) => {
      mockProgress[record.id] = record as unknown as TechnicianProgress
    },
  })

  return {
    getDb: () => ({
      tables: [],
      module_completions: makeTable(() => mockModuleCompletions),
      micro_learning_modules: makeTable(() => mockModules),
      supervised_procedures: makeTable(() => mockSupervisedProcedures),
      check_in_records: makeTable(() => mockCheckIns),
      learning_journal: makeTable(() => mockJournals),
      mentorship_pairings: {
        where: () => ({
          equals: () => ({
            toArray: async () => mockPairings.filter((p) => p.status === 'active'),
          }),
        }),
      },
      technician_progress: {
        get: async (id: string) => mockProgress[id] ?? undefined,
        put: async (p: TechnicianProgress) => { mockProgress[p.id] = p },
      },
    }),
  }
})

beforeEach(() => {
  mockModuleCompletions = []
  mockModules = []
  mockSupervisedProcedures = []
  mockCheckIns = []
  mockJournals = []
  mockPairings = []
  mockProgress = {}
})

// ---------------------------------------------------------------------------
// calculateProgress
// ---------------------------------------------------------------------------

describe('calculateProgress', () => {
  it('returns 0% when no activity', async () => {
    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    expect(progress.overallPercent).toBe(0)
    expect(progress.currentLevel).toBeNull()
    expect(progress.technicianId).toBe(TECHNICIAN_ID)
    expect(progress.pathwayId).toBe(PATHWAY.id)
    expect(progress.syncStatus).toBe('pending')
  })

  it('counts only passed module completions', async () => {
    mockModuleCompletions = [
      { id: 'c1', moduleId: 'm1', moduleVersion: '1', technicianId: TECHNICIAN_ID, completedAt: '', assessmentScore: 0.8, assessmentPassed: true, syncStatus: 'pending' },
      { id: 'c2', moduleId: 'm2', moduleVersion: '1', technicianId: TECHNICIAN_ID, completedAt: '', assessmentScore: 0.5, assessmentPassed: false, syncStatus: 'pending' },
      { id: 'c3', moduleId: 'm3', moduleVersion: '1', technicianId: TECHNICIAN_ID, completedAt: '', assessmentScore: 0.9, assessmentPassed: true, syncStatus: 'pending' },
    ]

    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    const moduleMs = progress.milestoneProgress.find((m) => m.milestoneId === 'ms-modules')
    expect(moduleMs?.currentValue).toBe(2) // 2 passed
  })

  it('calculates education hours from module durations', async () => {
    mockModuleCompletions = [
      { id: 'c1', moduleId: 'm1', moduleVersion: '1', technicianId: TECHNICIAN_ID, completedAt: '', assessmentScore: 1, assessmentPassed: true, syncStatus: 'pending' },
      { id: 'c2', moduleId: 'm2', moduleVersion: '1', technicianId: TECHNICIAN_ID, completedAt: '', assessmentScore: 1, assessmentPassed: true, syncStatus: 'pending' },
    ]
    mockModules = [
      { id: 'm1', procedureRef: '58410-2', durationMinutes: 360 }, // 6 hours
      { id: 'm2', procedureRef: '718-7', durationMinutes: 240 },   // 4 hours
    ]

    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    const hoursMs = progress.milestoneProgress.find((m) => m.milestoneId === 'ms-hours')
    expect(hoursMs?.currentValue).toBe(10) // 6 + 4 hours
  })

  it('counts supervised procedures', async () => {
    mockSupervisedProcedures = [
      { id: 'sp1', technicianId: TECHNICIAN_ID, procedureRef: '58410-2' },
      { id: 'sp2', technicianId: TECHNICIAN_ID, procedureRef: '718-7' },
    ]

    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    const supervisedMs = progress.milestoneProgress.find((m) => m.milestoneId === 'ms-supervised')
    expect(supervisedMs?.currentValue).toBe(2)
  })

  it('counts mentorship activities (check-ins + journal entries)', async () => {
    mockPairings = [{ id: 'pair-1', menteeId: TECHNICIAN_ID, status: 'active' }]
    mockCheckIns = [
      { id: 'ci1', pairingId: 'pair-1' },
      { id: 'ci2', pairingId: 'pair-1' },
    ]
    mockJournals = [
      { id: 'j1', authorId: TECHNICIAN_ID, pairingId: 'pair-1' },
    ]

    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    const mentorMs = progress.milestoneProgress.find((m) => m.milestoneId === 'ms-mentorship')
    expect(mentorMs?.currentValue).toBe(3) // 2 check-ins + 1 journal
  })

  it('sets overallPercent to 100 when all milestones complete', async () => {
    // Complete all milestones
    mockModuleCompletions = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, moduleId: `m${i}`, moduleVersion: '1', technicianId: TECHNICIAN_ID,
      completedAt: '', assessmentScore: 1, assessmentPassed: true, syncStatus: 'pending' as const,
    }))
    mockModules = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`, procedureRef: '58410-2', durationMinutes: 120,
    }))
    mockSupervisedProcedures = Array.from({ length: 3 }, (_, i) => ({
      id: `sp${i}`, technicianId: TECHNICIAN_ID, procedureRef: '58410-2',
    }))
    mockPairings = [{ id: 'pair-1', menteeId: TECHNICIAN_ID, status: 'active' }]
    mockCheckIns = Array.from({ length: 5 }, (_, i) => ({ id: `ci${i}`, pairingId: 'pair-1' }))

    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    expect(progress.overallPercent).toBe(100)
  })

  it('filters supervised procedures by LOINC code when procedureFilter set', async () => {
    const pathwayWithFilter: CertificationPathway = {
      ...PATHWAY,
      milestones: [
        {
          id: 'ms-hema',
          pathwayId: 'pathway-level1',
          name: 'Hematology procedures',
          description: '',
          category: 'supervised_procedures',
          requirement: { type: 'count', target: 2, procedureFilter: ['58410-2', '718-7'] },
          order: 1,
        },
      ],
    }

    mockSupervisedProcedures = [
      { id: 'sp1', technicianId: TECHNICIAN_ID, procedureRef: '58410-2' }, // in filter
      { id: 'sp2', technicianId: TECHNICIAN_ID, procedureRef: '2160-0' },  // NOT in filter
    ]

    const progress = await calculateProgress(TECHNICIAN_ID, pathwayWithFilter)
    const ms = progress.milestoneProgress.find((m) => m.milestoneId === 'ms-hema')
    expect(ms?.currentValue).toBe(1) // only sp1 counts
  })

  it('sets currentLevel to last completed milestone name', async () => {
    mockModuleCompletions = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, moduleId: `m${i}`, moduleVersion: '1', technicianId: TECHNICIAN_ID,
      completedAt: '', assessmentScore: 1, assessmentPassed: true, syncStatus: 'pending' as const,
    }))
    mockModules = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`, procedureRef: '58410-2', durationMinutes: 90, // 7.5h total < 10h target
    }))

    const progress = await calculateProgress(TECHNICIAN_ID, PATHWAY)
    // Only modules milestone complete (5/5), not hours (7/10)
    expect(progress.currentLevel).toBe('Complete 5 modules')
  })
})

// ---------------------------------------------------------------------------
// detectNewlyCompletedMilestones
// ---------------------------------------------------------------------------

describe('detectNewlyCompletedMilestones', () => {
  it('detects all milestones as new when oldProgress is null', () => {
    const newProgress: TechnicianProgress = {
      id: 'p1',
      technicianId: TECHNICIAN_ID,
      pathwayId: 'pathway-level1',
      milestoneProgress: [
        { milestoneId: 'ms-1', currentValue: 5, targetValue: 5 },
        { milestoneId: 'ms-2', currentValue: 2, targetValue: 10 },
      ],
      overallPercent: 50,
      currentLevel: null,
      updatedAt: '',
      syncStatus: 'pending',
    }

    const newly = detectNewlyCompletedMilestones(null, newProgress)
    expect(newly).toContain('ms-1')
    expect(newly).not.toContain('ms-2')
  })

  it('detects newly completed (was incomplete, now complete)', () => {
    const oldProgress: TechnicianProgress = {
      id: 'p1', technicianId: TECHNICIAN_ID, pathwayId: 'p',
      milestoneProgress: [{ milestoneId: 'ms-1', currentValue: 3, targetValue: 5 }],
      overallPercent: 0, currentLevel: null, updatedAt: '', syncStatus: 'pending',
    }
    const newProgress: TechnicianProgress = {
      id: 'p1', technicianId: TECHNICIAN_ID, pathwayId: 'p',
      milestoneProgress: [{ milestoneId: 'ms-1', currentValue: 5, targetValue: 5 }],
      overallPercent: 100, currentLevel: null, updatedAt: '', syncStatus: 'pending',
    }

    const newly = detectNewlyCompletedMilestones(oldProgress, newProgress)
    expect(newly).toEqual(['ms-1'])
  })

  it('does not report already-completed milestones as new', () => {
    const oldProgress: TechnicianProgress = {
      id: 'p1', technicianId: TECHNICIAN_ID, pathwayId: 'p',
      milestoneProgress: [{ milestoneId: 'ms-1', currentValue: 5, targetValue: 5, completedAt: '2026-01-01T00:00:00Z' }],
      overallPercent: 100, currentLevel: null, updatedAt: '', syncStatus: 'pending',
    }
    const newProgress: TechnicianProgress = {
      id: 'p1', technicianId: TECHNICIAN_ID, pathwayId: 'p',
      milestoneProgress: [{ milestoneId: 'ms-1', currentValue: 5, targetValue: 5, completedAt: '2026-01-01T00:00:00Z' }],
      overallPercent: 100, currentLevel: null, updatedAt: '', syncStatus: 'pending',
    }

    const newly = detectNewlyCompletedMilestones(oldProgress, newProgress)
    expect(newly).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// saveProgressAndDetectCompletions
// ---------------------------------------------------------------------------

describe('saveProgressAndDetectCompletions', () => {
  it('saves progress to Dexie and returns newly completed IDs', async () => {
    mockModuleCompletions = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, moduleId: `m${i}`, moduleVersion: '1', technicianId: TECHNICIAN_ID,
      completedAt: '', assessmentScore: 1, assessmentPassed: true, syncStatus: 'pending' as const,
    }))

    const { progress, newlyCompletedMilestoneIds } = await saveProgressAndDetectCompletions(
      TECHNICIAN_ID,
      PATHWAY,
    )

    expect(mockProgress[`${TECHNICIAN_ID}-${PATHWAY.id}`]).toBeDefined()
    expect(newlyCompletedMilestoneIds).toContain('ms-modules')
    expect(progress.overallPercent).toBeGreaterThan(0)
  })

  it('preserves existing completedAt timestamps on re-computation', async () => {
    const existingProgress: TechnicianProgress = {
      id: `${TECHNICIAN_ID}-${PATHWAY.id}`,
      technicianId: TECHNICIAN_ID,
      pathwayId: PATHWAY.id,
      milestoneProgress: [
        { milestoneId: 'ms-modules', currentValue: 5, targetValue: 5, completedAt: '2026-03-01T00:00:00Z' },
      ],
      overallPercent: 25,
      currentLevel: 'Complete 5 modules',
      updatedAt: '2026-03-01T00:00:00Z',
      syncStatus: 'synced',
    }
    mockProgress[existingProgress.id] = existingProgress

    mockModuleCompletions = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, moduleId: `m${i}`, moduleVersion: '1', technicianId: TECHNICIAN_ID,
      completedAt: '', assessmentScore: 1, assessmentPassed: true, syncStatus: 'pending' as const,
    }))

    const { progress } = await saveProgressAndDetectCompletions(TECHNICIAN_ID, PATHWAY)
    const moduleMs = progress.milestoneProgress.find((m) => m.milestoneId === 'ms-modules')
    // Should preserve the original completedAt timestamp
    expect(moduleMs?.completedAt).toBe('2026-03-01T00:00:00Z')
  })
})

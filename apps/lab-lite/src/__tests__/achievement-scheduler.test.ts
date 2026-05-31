/**
 * Story 51.7 — Gamified Team Quality Engagement: Scheduler Tests
 * Task 9.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  runDueEvaluations,
  isMonthlyEvaluationDue,
  isWeeklyEvaluationDue,
  isMilestoneCheckDue,
} from '../lib/achievement-scheduler'
import type { AchievementSchedulerConfig } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock DB and achievement service
// ---------------------------------------------------------------------------

let mockConfig: AchievementSchedulerConfig = {
  id: 'achievement-scheduler',
  lastMonthlyEvaluation: null,
  lastWeeklyEvaluation: null,
  lastMilestoneCheck: null,
  gamificationEnabled: true,
}

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getAchievementSchedulerConfig: async () => ({ ...mockConfig }),
    putAchievementSchedulerConfig: async (config: AchievementSchedulerConfig) => {
      Object.assign(mockConfig, config)
    },
  }
})

vi.mock('../lib/achievement-service', () => ({
  evaluateMonthlyAchievements: vi.fn().mockResolvedValue([]),
  evaluateWeeklyAchievements: vi.fn().mockResolvedValue([]),
  checkTeamMilestones: vi.fn().mockResolvedValue([]),
  getIsoWeekString: (d: Date) => {
    const year = d.getFullYear()
    const weekStart = new Date(d)
    weekStart.setDate(d.getDate() - (d.getDay() || 7) + 1)
    const jan4 = new Date(Date.UTC(year, 0, 4))
    const mondayW1 = new Date(jan4)
    mondayW1.setUTCDate(jan4.getUTCDate() - (jan4.getUTCDay() || 7) + 1)
    const weekNo = Math.ceil((((weekStart.getTime() - mondayW1.getTime()) / 86400000) + 1) / 7)
    return `${year}-W${String(weekNo).padStart(2, '0')}`
  },
}))

beforeEach(() => {
  mockConfig = {
    id: 'achievement-scheduler',
    lastMonthlyEvaluation: null,
    lastWeeklyEvaluation: null,
    lastMilestoneCheck: null,
    gamificationEnabled: true,
  }
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runDueEvaluations', () => {
  it('runs monthly evaluation when not yet evaluated for previous month', async () => {
    const { evaluateMonthlyAchievements } = await import('../lib/achievement-service')
    mockConfig.lastMonthlyEvaluation = null

    await runDueEvaluations()

    expect(evaluateMonthlyAchievements).toHaveBeenCalledOnce()
  })

  it('skips monthly evaluation if already evaluated for previous month', async () => {
    const now = new Date()
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    mockConfig.lastMonthlyEvaluation = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

    const { evaluateMonthlyAchievements } = await import('../lib/achievement-service')
    await runDueEvaluations()

    expect(evaluateMonthlyAchievements).not.toHaveBeenCalled()
  })

  it('runs weekly evaluation when not yet evaluated for previous week', async () => {
    const { evaluateWeeklyAchievements } = await import('../lib/achievement-service')
    mockConfig.lastWeeklyEvaluation = null

    await runDueEvaluations()

    expect(evaluateWeeklyAchievements).toHaveBeenCalledOnce()
  })

  it('runs milestone check when not yet checked today', async () => {
    const { checkTeamMilestones } = await import('../lib/achievement-service')
    mockConfig.lastMilestoneCheck = null

    await runDueEvaluations()

    expect(checkTeamMilestones).toHaveBeenCalledOnce()
  })

  it('skips milestone check if already checked today', async () => {
    const { checkTeamMilestones } = await import('../lib/achievement-service')
    mockConfig.lastMilestoneCheck = new Date().toISOString().slice(0, 10)

    await runDueEvaluations()

    expect(checkTeamMilestones).not.toHaveBeenCalled()
  })

  it('does nothing when gamification is disabled', async () => {
    mockConfig.gamificationEnabled = false
    const { evaluateMonthlyAchievements, evaluateWeeklyAchievements, checkTeamMilestones } =
      await import('../lib/achievement-service')

    await runDueEvaluations()

    expect(evaluateMonthlyAchievements).not.toHaveBeenCalled()
    expect(evaluateWeeklyAchievements).not.toHaveBeenCalled()
    expect(checkTeamMilestones).not.toHaveBeenCalled()
  })

  it('prevents duplicate evaluation — updates lastMonthlyEvaluation after run', async () => {
    mockConfig.lastMonthlyEvaluation = null

    await runDueEvaluations()

    // After running, the config should be updated to prevent re-evaluation
    expect(mockConfig.lastMonthlyEvaluation).not.toBeNull()
  })
})

describe('evaluation due checks', () => {
  it('isMonthlyEvaluationDue returns true when never evaluated', async () => {
    mockConfig.lastMonthlyEvaluation = null
    expect(await isMonthlyEvaluationDue()).toBe(true)
  })

  it('isMonthlyEvaluationDue returns false when already evaluated this period', async () => {
    const now = new Date()
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth()
    mockConfig.lastMonthlyEvaluation = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
    expect(await isMonthlyEvaluationDue()).toBe(false)
  })

  it('isMilestoneCheckDue returns true when never checked', async () => {
    mockConfig.lastMilestoneCheck = null
    expect(await isMilestoneCheckDue()).toBe(true)
  })

  it('isMilestoneCheckDue returns false when checked today', async () => {
    mockConfig.lastMilestoneCheck = new Date().toISOString().slice(0, 10)
    expect(await isMilestoneCheckDue()).toBe(false)
  })

  it('isWeeklyEvaluationDue returns false when gamification is disabled', async () => {
    mockConfig.gamificationEnabled = false
    mockConfig.lastWeeklyEvaluation = null
    expect(await isWeeklyEvaluationDue()).toBe(false)
  })
})

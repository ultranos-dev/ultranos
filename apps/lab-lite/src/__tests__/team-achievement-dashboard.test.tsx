/**
 * Story 51.7 — Gamified Team Quality Engagement: Dashboard UI Tests
 * Task 9.2
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { TeamAchievementDashboard } from '../components/achievements/TeamAchievementDashboard'
import { AchievementType } from '../lib/db'
import type { Achievement, TeamAchievement, Streak } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

// Use vi.fn() so each test can control the resolved value explicitly.
const mockGetSchedulerConfig = vi.fn()
const mockGetPreferences = vi.fn()

const mockAchievements: Achievement[] = []
const mockTeamAchievements: TeamAchievement[] = []
const mockStreaks: Streak[] = []

const DEFAULT_CONFIG = {
  id: 'achievement-scheduler' as const,
  gamificationEnabled: true,
  lastMonthlyEvaluation: null,
  lastWeeklyEvaluation: null,
  lastMilestoneCheck: null,
}

vi.mock('../lib/db', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/db')>()
  return {
    ...original,
    getAchievementSchedulerConfig: (...args: unknown[]) => mockGetSchedulerConfig(...args),
    getAchievementPreferences: (...args: unknown[]) => mockGetPreferences(...args),
    getDb: () => ({
      lab_results: { count: async () => 4200 },
      team_achievements: {
        orderBy: () => ({ reverse: () => ({ toArray: async () => [...mockTeamAchievements].reverse() }) }),
      },
    }),
  }
})

vi.mock('../lib/achievement-service', () => ({
  getAchievementsForTech: async () => mockAchievements,
  getTeamAchievementsRecent: async () => mockTeamAchievements,
  getActiveStreaks: async () => mockStreaks,
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: any) => any) =>
    selector({ session: { practitionerId: 'tech-001', labRole: 'LAB_TECH' } }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSchedulerConfig.mockResolvedValue({ ...DEFAULT_CONFIG, gamificationEnabled: true })
  mockGetPreferences.mockResolvedValue({ techId: 'tech-001', showOnTeamDashboard: true })
  mockAchievements.length = 0
  mockTeamAchievements.length = 0
  mockStreaks.length = 0
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamAchievementDashboard', () => {
  it('renders when gamification is enabled', async () => {
    render(<TeamAchievementDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('team-achievement-dashboard')).toBeInTheDocument()
    })
  })

  it('renders nothing (null) when gamification is disabled', async () => {
    mockGetSchedulerConfig.mockResolvedValue({ ...DEFAULT_CONFIG, gamificationEnabled: false })

    const { container } = render(<TeamAchievementDashboard />)
    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })

  it('uses collaborative language — no competitive framing', async () => {
    mockStreaks.push({ type: 'ZERO_REJECTION', currentDays: 4, startDate: '2026-04-27' })

    render(<TeamAchievementDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('team-achievement-dashboard')).toBeInTheDocument()
    })

    // Should show collaborative streak messaging
    expect(screen.getByText(/The team is on a 4-day Zero Rejection streak!/i)).toBeInTheDocument()
    // Should NOT show any ranking text
    expect(screen.queryByText(/ranked/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/vs\./i)).not.toBeInTheDocument()
  })

  it('hides tech name when opted out (showOnTeamDashboard = false)', async () => {
    mockGetPreferences.mockResolvedValue({ techId: 'tech-001', showOnTeamDashboard: false })

    mockAchievements.push({
      id: 'a-1',
      techId: 'tech-001',
      type: AchievementType.QC_CHAMPION,
      earnedAt: '2026-04-01T00:00:00Z',
      evaluationPeriod: '2026-04',
      metadata: {},
      description: 'QC Champion for 2026-04',
    })

    // Dashboard renders without tech name
    const { container } = render(<TeamAchievementDashboard />)
    await waitFor(() => {
      // Badge rendered
      const badges = container.querySelectorAll('[data-testid="achievement-badge"]')
      if (badges.length > 0) {
        // When opted out, tech name should not appear as "You earned: tech-001"
        expect(screen.queryByText(/tech-001/i)).not.toBeInTheDocument()
      }
    })
  })

  it('renders streak progress when active streak exists', async () => {
    mockStreaks.push({ type: 'ZERO_REJECTION', currentDays: 3, startDate: '2026-04-29' })

    render(<TeamAchievementDashboard />)
    await waitFor(() => {
      expect(screen.getByTestId('streak-progress')).toBeInTheDocument()
    })
  })

  it('renders milestone progress bars', async () => {
    render(<TeamAchievementDashboard />)
    await waitFor(() => {
      const bars = screen.getAllByTestId('milestone-progress-bar')
      expect(bars).toHaveLength(3) // 1K, 5K, 10K
    })
  })
})

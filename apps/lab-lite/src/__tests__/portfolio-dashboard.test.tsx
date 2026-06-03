/**
 * Story 51.6 — Technician Performance Portfolio: Dashboard UI Tests
 * Task 8: Tests for PortfolioDashboard component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PortfolioDashboard } from '../components/portfolio/PortfolioDashboard'
import type { FullPortfolioMetrics } from '../lib/portfolio-service'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockMetrics: FullPortfolioMetrics = {
  techId: 'tech-1',
  dateRange: { startDate: '2026-01-01', endDate: '2026-01-31' },
  testsPerShift: { value: 5.2, unit: 'tests/shift', trend: 'IMPROVING', previousValue: 4.0, dataPoints: 10, noData: false },
  averageTAT: [{ loincCode: '718-7', avgTatMinutes: 45, trend: 'STABLE', previousAvgTatMinutes: 47, sampleCount: 20 }],
  qcPassRate: { value: 92, unit: '%', trend: 'STABLE', previousValue: 91, dataPoints: 24, noData: false },
  rejectionRate: { value: 4, unit: '%', trend: 'NEEDS_ATTENTION', previousValue: 2, dataPoints: 50, noData: false, rejectionBreakdown: [{ reason: 'hemolyzed', count: 2 }] },
  trainingModules: [{ sopId: 'sop-1', title: 'CBC Protocol', category: 'HEMATOLOGY', version: '1.0', acknowledgedAt: '2026-01-10T00:00:00Z' }],
  mentorshipCount: 1,
  achievements: [],
  calculatedAt: '2026-01-31T00:00:00Z',
}

vi.mock('../lib/portfolio-service', () => ({
  calculatePortfolioMetrics: vi.fn(() => Promise.resolve(mockMetrics)),
}))

vi.mock('../lib/portfolio-export', () => ({
  exportPortfolio: vi.fn(() => new Blob(['<html></html>'], { type: 'text/html' })),
  getExportFilename: vi.fn(() => 'portfolio_tech-1_2026-01-01_2026-01-31.html'),
}))

vi.mock('../lib/audit-client', () => ({
  reportPortfolioAuditEvent: vi.fn(),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn((selector) => selector({
    session: {
      practitionerId: 'tech-1',
      userId: 'user-1',
      email: 'tech@lab.test',
      labRole: 'LAB_TECH',
    },
    isAuthenticated: true,
  })),
}))

vi.mock('../components/portfolio/AchievementBadges', () => ({
  AchievementBadges: () => <div data-testid="achievement-badges">Achievements</div>,
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const map: Record<string, string> = {
      title: 'Professional Development Portfolio',
      strengths: 'Strengths',
      growthAreas: 'Growth Areas',
      testsPerShift: 'Tests per Shift',
      qcPassRate: 'QC Pass Rate',
      trainingModules: 'Training Modules Completed',
      rejectionRate: 'Sample Rejection Rate',
      mentorship: 'Mentorship Participation',
      averageTAT: 'Average Turnaround Time',
      achievements: 'Achievements',
      exportForReview: 'Export for Review',
      last30Days: 'Last 30 Days',
      last60Days: 'Last 60 Days',
      last90Days: 'Last 90 Days',
      noData: 'No data available for this period',
      improving: 'Improving',
      stable: 'Stable',
      needsAttention: 'Needs Attention',
      sharedBanner: `This portfolio is shared with ${values?.name ?? ''} for evaluation discussions`,
      selectPeriod: 'Select period',
      previousPeriod: 'Previous period',
      basedOn: 'Based on',
      runs: 'runs',
      completed: 'completed',
      sessions: 'sessions',
      viewList: 'View list',
      more: 'more',
      testCategory: 'Category',
      avgTAT: 'Avg TAT',
      trend: 'Trend',
      sampleCount: 'Samples',
    }
    return map[key] ?? key
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PortfolioDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the portfolio title', async () => {
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.getByTestId('portfolio-title')).toBeTruthy())
    expect(screen.getByTestId('portfolio-title').textContent).toContain('Professional Development Portfolio')
  })

  it('renders all 6 metric cards after loading', async () => {
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton')).toBeNull())
    expect(screen.getByText('Tests per Shift')).toBeTruthy()
    expect(screen.getByText('QC Pass Rate')).toBeTruthy()
    expect(screen.getByText('Training Modules Completed')).toBeTruthy()
    expect(screen.getByText('Sample Rejection Rate')).toBeTruthy()
    expect(screen.getByText('Mentorship Participation')).toBeTruthy()
    expect(screen.getByText('Average Turnaround Time')).toBeTruthy()
  })

  it('uses professional development language (Strengths/Growth Areas, not Compliance/Weakness)', async () => {
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton')).toBeNull())
    expect(screen.getByTestId('strengths-heading').textContent).toContain('Strengths')
    expect(screen.getByTestId('growth-areas-heading').textContent).toContain('Growth Areas')
    // Must NOT contain surveillance language
    expect(screen.queryByText(/Compliance/i)).toBeNull()
    expect(screen.queryByText(/Weakness/i)).toBeNull()
    expect(screen.queryByText(/Surveillance/i)).toBeNull()
    expect(screen.queryByText(/Failing/i)).toBeNull()
  })

  it('shows date range pills and updates on click', async () => {
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.getByTestId('range-30')).toBeTruthy())
    const btn60 = screen.getByTestId('range-60')
    fireEvent.click(btn60)
    expect(btn60.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders the export button', async () => {
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.getByTestId('export-button')).toBeTruthy())
  })

  it('does NOT show supervisor banner when viewing own portfolio', async () => {
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton')).toBeNull())
    expect(screen.queryByTestId('supervisor-banner')).toBeNull()
  })

  it('shows supervisor banner when targetTechId is provided', async () => {
    render(<PortfolioDashboard targetTechId="tech-2" targetTechName="Another Tech" />)
    await waitFor(() => expect(screen.getByTestId('supervisor-banner')).toBeTruthy())
    expect(screen.getByTestId('supervisor-banner').textContent).toContain('Another Tech')
    expect(screen.getByTestId('supervisor-banner').textContent).toContain('evaluation discussions')
  })

  it('emits audit event when supervisor views another tech portfolio', async () => {
    const { reportPortfolioAuditEvent } = await import('../lib/audit-client')
    render(<PortfolioDashboard targetTechId="tech-2" targetTechName="Another Tech" />)
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton')).toBeNull())
    expect(reportPortfolioAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PORTFOLIO_VIEWED_BY_SUPERVISOR', targetTechId: 'tech-2' })
    )
  })

  it('does NOT emit audit event for self-view', async () => {
    const { reportPortfolioAuditEvent } = await import('../lib/audit-client')
    render(<PortfolioDashboard />)
    await waitFor(() => expect(screen.queryByTestId('loading-skeleton')).toBeNull())
    expect(reportPortfolioAuditEvent).not.toHaveBeenCalled()
  })
})

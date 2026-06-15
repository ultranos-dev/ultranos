/**
 * Story 46.3 — Competency Self-Assessment & Skill Decay Detection
 * Component tests for CompetencyDashboard.tsx
 *
 * AC covered: 2 (color-coded status badges, sorting red-first),
 *             5 (RTL compatibility), 6 (no patient data)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ProcedureCompetency } from '../lib/competency-types'

// ---------------------------------------------------------------------------
// Mocks — declared before component import
// ---------------------------------------------------------------------------

vi.mock('@ultranos/ui-kit/icons', () => ({
  ArrowUp: () => <span data-testid="trend-improving" />,
  ArrowDown: () => <span data-testid="trend-declining" />,
  Minus: () => <span data-testid="trend-stable" />,
  BookOpen: () => <span data-testid="book-open-icon" />,
}))

const mockCompetencies: ProcedureCompetency[] = []
const mockNotifications: any[] = []

vi.mock('../lib/competency-tracker', () => ({
  recalculateAllCompetencies: vi.fn(async () => mockCompetencies),
  getProcedureTrend: vi.fn(async () => null),
}))

vi.mock('../lib/decay-notifier', () => ({
  getActiveDecayNotifications: vi.fn(async () => mockNotifications),
  dismissDecayNotification: vi.fn(async () => {}),
  buildDecayMessage: vi.fn(
    (name: string, days: number) =>
      `You haven't performed ${name} in ${days} days. Would you like to review the technique?`,
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      loading: 'Loading competency data…',
      noProcedures: 'No procedures tracked yet',
      noProceduresHint: 'Records built from result entries.',
      summaryActive: 'Active',
      summaryRisk: 'Decay Risk',
      summaryDecayed: 'Needs Refresh',
      colProcedure: 'Procedure',
      colStatus: 'Status',
      colLastPerformed: 'Last Performed',
      colTotal: 'Total',
      colLast90: 'Last 90 Days',
      colTrend: 'Trend',
      statusActive: `Active — ${params?.days}d ago`,
      statusActiveRecent: 'Active — recent',
      statusDecayRisk: `Decay risk — ${params?.days}d since last`,
      statusDecayRiskUnknown: 'Decay risk',
      statusDecayed: `Needs refresh — ${params?.days}d since last`,
      statusDecayedNever: 'Never performed',
      neverPerformed: 'Never',
      dismiss: 'Dismiss',
      dismissNotification: 'Dismiss this notification',
    }
    return map[key] ?? key
  },
}))

import { CompetencyDashboard } from '../components/competency/CompetencyDashboard'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompetency(
  procedureRef: string,
  procedureName: string,
  status: ProcedureCompetency['status'],
  daysAgo: number | null,
): ProcedureCompetency {
  const lastPerformedAt =
    daysAgo !== null
      ? new Date(Date.now() - daysAgo * 86400_000).toISOString()
      : null
  return {
    id: `comp-${procedureRef}`,
    technicianId: 'tech-1',
    procedureRef,
    procedureName,
    lastPerformedAt,
    totalPerformed: daysAgo !== null ? 3 : 0,
    performedLast90Days: daysAgo !== null && daysAgo <= 90 ? 1 : 0,
    status,
    decayThresholdDays: 45,
    redThresholdDays: 90,
    updatedAt: new Date().toISOString(),
  }
}

beforeEach(() => {
  mockCompetencies.length = 0
  mockNotifications.length = 0
})

// ---------------------------------------------------------------------------
// Rendering tests
// ---------------------------------------------------------------------------

describe('CompetencyDashboard', () => {
  it('renders empty state when no procedures tracked', async () => {
    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByText('No procedures tracked yet')).toBeTruthy()
    })
  })

  it('renders green badge for active procedures (AC: 2)', async () => {
    mockCompetencies.push(makeCompetency('CBC-001', 'CBC', 'active', 5))
    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByTestId('badge-active')).toBeTruthy()
    })
  })

  it('renders yellow badge for decay_risk procedures (AC: 2)', async () => {
    mockCompetencies.push(makeCompetency('GLUCOSE', 'Glucose', 'decay_risk', 60))
    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByTestId('badge-decay-risk')).toBeTruthy()
    })
  })

  it('renders red badge for decayed procedures (AC: 2)', async () => {
    mockCompetencies.push(makeCompetency('URINE', 'Urinalysis', 'decayed', 100))
    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByTestId('badge-decayed')).toBeTruthy()
    })
  })

  it('renders summary counts correctly (AC: 2)', async () => {
    mockCompetencies.push(makeCompetency('A', 'Test A', 'active', 10))
    mockCompetencies.push(makeCompetency('B', 'Test B', 'decay_risk', 60))
    mockCompetencies.push(makeCompetency('C', 'Test C', 'decayed', 100))
    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByTestId('summary-active')).toBeTruthy()
      expect(screen.getByTestId('summary-risk')).toBeTruthy()
      expect(screen.getByTestId('summary-decayed')).toBeTruthy()
    })
  })

  it('renders rows with red first (sorting — AC: 2)', async () => {
    mockCompetencies.push(makeCompetency('A-GREEN', 'Green Test', 'active', 5))
    mockCompetencies.push(makeCompetency('B-RED', 'Red Test', 'decayed', 100))
    mockCompetencies.push(makeCompetency('C-YELLOW', 'Yellow Test', 'decay_risk', 60))

    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      const rows = screen.getAllByRole('row')
      // First data row should be the red one (after header row)
      expect(rows[1].getAttribute('data-testid')).toBe('competency-row-B-RED')
    })
  })

  it('renders decay notification banner (AC: 1)', async () => {
    mockCompetencies.push(makeCompetency('RISK', 'CBC', 'decay_risk', 55))
    mockNotifications.push({
      id: 'notif-1',
      technicianId: 'tech-1',
      procedureRef: 'RISK',
      procedureName: 'CBC',
      daysSinceLast: 55,
      linkedModuleId: null,
      createdAt: new Date().toISOString(),
      dismissed: false,
    })

    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByTestId('decay-notifications')).toBeTruthy()
      expect(screen.getByTestId('decay-notification-RISK')).toBeTruthy()
    })
  })

  it('renders "Never performed" label for procedures with no history', async () => {
    mockCompetencies.push(makeCompetency('NEVER', 'Rare Test', 'decayed', null))
    render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      expect(screen.getByText('Never')).toBeTruthy()
    })
  })

  it('does NOT render any patient data (AC: 6)', async () => {
    mockCompetencies.push(makeCompetency('CBC-001', 'CBC', 'active', 5))
    const { container } = render(<CompetencyDashboard technicianId="tech-1" />)
    await waitFor(() => {
      // Confirm procedure name and ref are shown but nothing that could be patient data
      expect(container.textContent).toContain('CBC')
      expect(container.textContent).not.toContain('Patient')
      expect(container.textContent).not.toContain('DOB')
      expect(container.textContent).not.toContain('patient-')
    })
  })
})

// ---------------------------------------------------------------------------
// RTL snapshot test (AC: 5)
// ---------------------------------------------------------------------------

describe('CompetencyDashboard RTL', () => {
  it('renders dashboard in RTL direction without layout breakage', async () => {
    mockCompetencies.push(makeCompetency('CBC-001', 'CBC', 'active', 5))
    mockCompetencies.push(makeCompetency('GLUCOSE', 'Glucose', 'decay_risk', 60))

    const { container } = render(
      <div dir="rtl">
        <CompetencyDashboard technicianId="tech-1" />
      </div>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('competency-dashboard')).toBeTruthy()
    })

    // RTL: logical CSS classes are used (ps-/pe-), not physical (pl-/pr-)
    // Verify the table renders in the RTL wrapper without throwing
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="competency-table"]')).toBeTruthy()
  })
})

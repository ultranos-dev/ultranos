import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { WorkloadPatternsView } from '../components/workload/WorkloadPatterns'
import type { WorkloadPatterns } from '../lib/workload-service'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/workload-service', () => ({
  getHistoricalPatterns: vi.fn().mockResolvedValue({
    avgSamplesPerTechPerShift: {},
    overloadedTechs: [],
    underutilizedTechs: [],
    peakHours: {},
    snapshotCount: 0,
  }),
}))

const emptyPatterns: WorkloadPatterns = {
  avgSamplesPerTechPerShift: {},
  overloadedTechs: [],
  underutilizedTechs: [],
  peakHours: {},
  snapshotCount: 0,
}

const populatedPatterns: WorkloadPatterns = {
  avgSamplesPerTechPerShift: {
    'tech-abc': 12.5,
    'tech-def': 8.0,
    'tech-ghi': 18.0,
  },
  overloadedTechs: ['tech-ghi'],
  underutilizedTechs: ['tech-def'],
  peakHours: { 8: 45, 14: 20, 10: 30 },
  snapshotCount: 21,
}

const messages = {
  workload: {
    dashboard: 'Workload Dashboard',
    pending: 'Pending',
    inProgress: 'In Progress',
    completedToday: 'Completed Today',
    estimatedCompletion: 'Est. Completion',
    etaOverdue: 'Overdue',
    reassign: 'Reassign Sample',
    unavailable: 'Unavailable',
    needsRedistribution: 'Needs Redistribution',
    patterns: 'Patterns',
    overloaded: 'Consistently Overloaded',
    elevated: 'Elevated',
    normal: 'Normal',
    underutilized: 'Consistently Underutilized',
    markUnavailable: 'Mark Unavailable',
    markAvailable: 'Mark Available',
    statusBreak: 'Break',
    statusAbsent: 'Absent',
    statusTraining: 'Training',
    saving: 'Saving…',
    techRoleBadge: 'Lab Tech',
    workloadCard: 'workload',
    showSamples: 'Show {count} sample(s)',
    hideSamples: 'Hide samples',
    legend: 'Legend',
    noAssignments: 'No tech assignments found',
    noAssignmentsHint: 'Samples will appear here once assigned to technicians.',
    insufficientPermissions: 'Insufficient permissions',
    errorLoadingWorkloads: 'Unable to load workload data.',
    errorLoadingPatterns: 'Unable to load pattern data.',
    retry: 'Retry',
    noData: 'No data available',
    noneIdentified: 'None identified',
    samples: 'samples',
    peakHours: 'Peak Load Times',
    avgSamplesPerShift: 'Average Samples per Tech per Shift',
    dateRange: 'Date range',
    lastNDays: 'Last {n} days',
    basedOnSnapshots: 'Based on {count} workload snapshot(s).',
    loading: 'Loading…',
  },
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkloadPatternsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders date range selector buttons', () => {
    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    expect(screen.getByText('Last 7 days')).toBeDefined()
    expect(screen.getByText('Last 14 days')).toBeDefined()
    expect(screen.getByText('Last 30 days')).toBeDefined()
  })

  it('shows "no data" message when no snapshots available', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    vi.mocked(getHistoricalPatterns).mockResolvedValue(emptyPatterns)

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    const noDataMessages = await screen.findAllByText('No data available')
    expect(noDataMessages.length).toBeGreaterThan(0)
  })

  it('shows populated data when snapshots exist', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    vi.mocked(getHistoricalPatterns).mockResolvedValue(populatedPatterns)

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    await screen.findByText('Based on 21 workload snapshot(s).')
    expect(screen.getByText('Average Samples per Tech per Shift')).toBeDefined()
  })

  it('shows overloaded tech in red section', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    vi.mocked(getHistoricalPatterns).mockResolvedValue(populatedPatterns)

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    await screen.findByText('Based on 21 workload snapshot(s).')

    // The overloaded section should list the tech label for tech-ghi
    expect(screen.getByText('Consistently Overloaded')).toBeDefined()
  })

  it('shows underutilized tech section', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    vi.mocked(getHistoricalPatterns).mockResolvedValue(populatedPatterns)

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    await screen.findByText('Based on 21 workload snapshot(s).')
    expect(screen.getByText('Consistently Underutilized')).toBeDefined()
  })

  it('shows peak hours section', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    vi.mocked(getHistoricalPatterns).mockResolvedValue(populatedPatterns)

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    await screen.findByText('Peak Load Times')
    // Hour 8 is the peak
    expect(screen.getByText('8:00 AM')).toBeDefined()
  })

  it('changes date range when a range button is clicked', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    const mockFn = vi.mocked(getHistoricalPatterns)
    mockFn.mockResolvedValue(emptyPatterns)

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    await screen.findAllByText('No data available')

    // Click "Last 7 days"
    fireEvent.click(screen.getByText('Last 7 days'))

    await waitFor(() => {
      expect(mockFn).toHaveBeenLastCalledWith(7)
    })
  })

  it('shows "none identified" when no overloaded or underutilized techs', async () => {
    const { getHistoricalPatterns } = await import('../lib/workload-service')
    vi.mocked(getHistoricalPatterns).mockResolvedValue({
      ...emptyPatterns,
      snapshotCount: 5,
    })

    render(<Wrapper><WorkloadPatternsView /></Wrapper>)
    await screen.findByText('Based on 5 workload snapshot(s).')
    const noneMessages = screen.getAllByText('None identified')
    expect(noneMessages.length).toBeGreaterThanOrEqual(2)
  })
})

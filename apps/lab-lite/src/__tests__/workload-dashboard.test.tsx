import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { WorkloadDashboard } from '../components/workload/WorkloadDashboard'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/workload-service', () => ({
  getCurrentWorkloads: vi.fn().mockResolvedValue([
    {
      techId: 'tech-abc12345',
      pendingCount: 5,
      inProgressCount: 2,
      completedCount: 8,
      estimatedCompletionAt: new Date(Date.now() + 60 * 60_000),
      loadLevel: 'GREEN',
      sampleIds: ['sample-1', 'sample-2'],
      isUnavailable: false,
      availabilityReason: null,
    },
    {
      techId: 'tech-def67890',
      pendingCount: 12,
      inProgressCount: 5,
      completedCount: 3,
      estimatedCompletionAt: new Date(Date.now() + 180 * 60_000),
      loadLevel: 'RED',
      sampleIds: ['sample-3'],
      isUnavailable: false,
      availabilityReason: null,
    },
  ]),
  reassignSample: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../lib/audit-client', () => ({
  reportWorkloadAuditEvent: vi.fn(),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: any) =>
    selector({
      session: { userId: 'user-1', labRole: 'SUPERVISOR', email: 'test@test.com' },
      isAuthenticated: true,
    }),
}))

vi.mock('../hooks/useLabPermission', () => ({
  useRequireLabRole: vi.fn().mockReturnValue(true),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/workload',
}))

// i18n messages for tests
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

describe('WorkloadDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dashboard heading', async () => {
    render(<Wrapper><WorkloadDashboard /></Wrapper>)
    // heading visible immediately (use role to distinguish from the tab button)
    expect(screen.getByRole('heading', { name: 'Workload Dashboard' })).toBeDefined()
  })

  it('shows skeleton while loading', () => {
    render(<Wrapper><WorkloadDashboard /></Wrapper>)
    // aria-busy loading region present on initial render
    const loadingRegion = document.querySelector('[aria-busy="true"]')
    expect(loadingRegion).toBeTruthy()
  })

  it('renders tech cards after data loads', async () => {
    render(<Wrapper><WorkloadDashboard /></Wrapper>)
    // Wait for the async getCurrentWorkloads to resolve
    const card = await screen.findByText('Tech …abc12345')
    expect(card).toBeDefined()
  })

  it('shows load level legend after loading', async () => {
    render(<Wrapper><WorkloadDashboard /></Wrapper>)
    await screen.findByText('Tech …abc12345')
    expect(screen.getByText('Legend:')).toBeDefined()
  })
})

describe('WorkloadDashboard — access control', () => {
  it('shows insufficient permissions message when user is below SUPERVISOR', async () => {
    const { useRequireLabRole } = await import('../hooks/useLabPermission')
    vi.mocked(useRequireLabRole).mockReturnValueOnce(false)

    render(<Wrapper><WorkloadDashboard /></Wrapper>)
    expect(screen.getByText('Insufficient permissions')).toBeDefined()
  })
})

describe('WorkloadDashboard — drag-reassign disabled for SUPERVISOR', () => {
  it('drag-reassign is disabled when user is SUPERVISOR (not LAB_MANAGER)', async () => {
    // SUPERVISOR can view, but session.labRole !== LAB_MANAGER so canReassign = false
    render(<Wrapper><WorkloadDashboard /></Wrapper>)
    await screen.findByText('Tech …abc12345')

    // No draggable list items should be present (dragEnabled=false on cards)
    const draggableItems = document.querySelectorAll('[draggable="true"]')
    expect(draggableItems).toHaveLength(0)
  })
})

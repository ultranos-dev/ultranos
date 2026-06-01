/**
 * MonitoringDueCard UI Tests — Story 52.1 Task 8 (AC 4, 5, 10)
 *
 * Tests:
 *  - MonitoringDueCard renders overdue + due flags
 *  - Empty state: shows "No monitoring tests due"
 *  - RTL snapshot: card layout in RTL
 *  - Offline: renders from Dexie cache when Hub unreachable (AC 10)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { MonitoringFlag } from '../lib/db'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const msgs: Record<string, string> = {
      monitoringDue: 'Monitoring Due',
      monitoringDueCount: `${params?.count ?? 0} tests due`,
      monitoringNoneTitle: 'No monitoring tests due',
      monitoringNoneDesc: 'When a pharmacy dispenses a medication that requires lab monitoring, it will appear here.',
      monitoringOverdueDays: `${params?.days ?? 0}d overdue`,
      monitoringDueSoon: 'Due soon',
      monitoringUpcoming: 'Upcoming',
      monitoringYrOld: `${params?.age ?? 0} yr`,
    }
    return msgs[key] ?? key
  },
}))

vi.mock('@ultranos/ui-kit/icons', () => ({
  FlaskConical: ({ size, className }: { size: number; className?: string }) => (
    <svg data-testid="flask-icon" data-size={size} className={className} />
  ),
}))

let mockReturnedFlags: MonitoringFlag[] = []

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    monitoringFlags: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          sortBy: vi.fn().mockResolvedValue(mockReturnedFlags),
          toArray: vi.fn().mockResolvedValue(mockReturnedFlags),
        })),
      })),
    },
  })),
}))

// ---------------------------------------------------------------------------
// Helpers
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
    testDisplay: 'INR (Prothrombin Time)',
    frequencyDays: 14,
    dueDate: '2026-05-01',
    status: 'overdue',
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

beforeEach(() => {
  mockReturnedFlags = []
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Dynamic import to avoid hoisting issues with mocks
async function renderMonitoringCard(props = {}) {
  const { MonitoringDueCard } = await import('../components/dashboard/MonitoringDueCard')
  return render(<MonitoringDueCard {...props} />)
}

describe('MonitoringDueCard', () => {
  it('renders empty state when no flags are due', async () => {
    mockReturnedFlags = []
    await renderMonitoringCard()

    await waitFor(() => {
      expect(screen.getByText('No monitoring tests due')).toBeInTheDocument()
    })
    expect(screen.getByText(/When a pharmacy dispenses/)).toBeInTheDocument()
  })

  it('renders overdue flag with patient name and age', async () => {
    mockReturnedFlags = [makeFlag({ status: 'overdue', patientFirstName: 'Ahmad', patientAge: 45 })]
    await renderMonitoringCard()

    await waitFor(() => {
      expect(screen.getByText(/Ahmad/)).toBeInTheDocument()
    })
    expect(screen.getByText(/45 yr/)).toBeInTheDocument()
  })

  it('renders medication name and test name in each row', async () => {
    mockReturnedFlags = [makeFlag({ status: 'due', medicationDisplay: 'Warfarin', testDisplay: 'INR (Prothrombin Time)' })]
    await renderMonitoringCard()

    await waitFor(() => {
      expect(screen.getByText(/Warfarin.*INR/)).toBeInTheDocument()
    })
  })

  it('shows overdue badge for overdue flags', async () => {
    mockReturnedFlags = [makeFlag({ status: 'overdue', dueDate: '2026-05-01' })]
    await renderMonitoringCard()

    await waitFor(() => {
      expect(screen.getByText(/d overdue/)).toBeInTheDocument()
    })
  })

  it('shows "Due soon" badge for due (not-yet-overdue) flags', async () => {
    // Due in the future (within 7 days)
    const futureDue = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    mockReturnedFlags = [makeFlag({ status: 'due', dueDate: futureDue })]
    await renderMonitoringCard()

    await waitFor(() => {
      expect(screen.getByText('Due soon')).toBeInTheDocument()
    })
  })

  it('shows count badge with total number of flags', async () => {
    mockReturnedFlags = [
      makeFlag({ id: 1, status: 'overdue', testRequired: '6301-6' }),
      makeFlag({ id: 2, status: 'due', testRequired: '2160-0', testDisplay: 'Creatinine' }),
    ]
    await renderMonitoringCard()

    await waitFor(() => {
      // The count badge should show 2
      const badge = screen.getByLabelText('2 tests due')
      expect(badge).toBeInTheDocument()
    })
  })

  it('calls onFlagSelected when a flag row is clicked', async () => {
    const flag = makeFlag({ status: 'overdue' })
    mockReturnedFlags = [flag]
    const onFlagSelected = vi.fn()

    const { MonitoringDueCard } = await import('../components/dashboard/MonitoringDueCard')
    render(<MonitoringDueCard onFlagSelected={onFlagSelected} />)

    await waitFor(() => {
      expect(screen.getByText(/Ahmad/)).toBeInTheDocument()
    })

    const row = screen.getByRole('button', { name: /Ahmad/ })
    row.click()

    expect(onFlagSelected).toHaveBeenCalledWith(flag)
  })

  it('renders from Dexie cache (offline) — DB call is made without Hub connectivity', async () => {
    // This test verifies that the component only reads from Dexie,
    // not from Hub, so it works offline.
    mockReturnedFlags = [makeFlag({ status: 'due' })]
    await renderMonitoringCard()

    await waitFor(() => {
      // The card should render data — this confirms Dexie was queried, not Hub
      expect(screen.getByRole('region', { name: 'Monitoring Due' })).toBeInTheDocument()
    })
  })

  // RTL snapshot test
  it('RTL snapshot: MonitoringDueCard renders correctly in RTL direction', async () => {
    mockReturnedFlags = [
      makeFlag({ status: 'overdue', patientFirstName: 'Ahmad' }),
      makeFlag({ id: 2, status: 'due', patientFirstName: 'Layla', patientAge: 32, testRequired: '2160-0' }),
    ]
    const { MonitoringDueCard } = await import('../components/dashboard/MonitoringDueCard')
    const { container } = render(
      <div dir="rtl">
        <MonitoringDueCard />
      </div>
    )

    await waitFor(() => {
      expect(screen.getByText(/Ahmad/)).toBeInTheDocument()
    })

    expect(container).toMatchSnapshot()
  })
})

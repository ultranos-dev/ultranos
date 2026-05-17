import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        session: {
          userId: 'u1',
          practitionerId: 'p1',
          role: 'PHARMACIST',
          sessionId: 's1',
          email: 'pharm@test.com',
        },
        isAuthenticated: true,
      }),
    {
      getState: () => ({
        session: {
          userId: 'u1',
          practitionerId: 'p1',
          role: 'PHARMACIST',
          sessionId: 's1',
          email: 'pharm@test.com',
        },
        isAuthenticated: true,
        getAccessToken: vi.fn().mockResolvedValue('test-token'),
        getPractitionerRef: () => 'Practitioner/p1',
      }),
    },
  ),
}))

// Mock fetch
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: { json: { success: true } } } }),
  }),
)

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}))

// Mock Dexie db for controlled dashboard stats
const mockSyncQueueCount = vi.fn().mockResolvedValue(0)
const mockSyncQueueToArray = vi.fn().mockResolvedValue([])
const mockDispensesWhere = vi.fn().mockReturnValue({
  aboveOrEqual: vi.fn().mockReturnValue({
    count: vi.fn().mockResolvedValue(0),
  }),
})
const mockDispensesOrderBy = vi.fn().mockReturnValue({
  reverse: vi.fn().mockReturnValue({
    limit: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([]),
    }),
  }),
})

vi.mock('@/lib/db', () => ({
  db: {
    syncQueue: {
      count: mockSyncQueueCount,
      toArray: mockSyncQueueToArray,
    },
    dispenses: {
      where: mockDispensesWhere,
      orderBy: mockDispensesOrderBy,
    },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Reset default mock implementations
  mockSyncQueueCount.mockResolvedValue(0)
  mockSyncQueueToArray.mockResolvedValue([])
  mockDispensesWhere.mockReturnValue({
    aboveOrEqual: vi.fn().mockReturnValue({
      count: vi.fn().mockResolvedValue(0),
    }),
  })
  mockDispensesOrderBy.mockReturnValue({
    reverse: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    }),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PharmacyDashboard', () => {
  async function renderDashboard() {
    const { PharmacyDashboard } = await import(
      '@/components/pharmacy/PharmacyDashboard'
    )
    return render(<PharmacyDashboard />)
  }

  it('renders welcome header with pharmacist name', async () => {
    await renderDashboard()
    expect(screen.getByText(/welcome/i)).toBeInTheDocument()
  })

  it('renders "Scan QR Prescription" and "Scan Paper Prescription" action buttons', async () => {
    await renderDashboard()
    const scanQrBtn = screen.getByRole('link', { name: /scan qr prescription/i })
    expect(scanQrBtn).toBeInTheDocument()
    expect(scanQrBtn).toHaveAttribute('href', '/scan')

    const scanPaperBtn = screen.getByRole('link', { name: /scan paper prescription/i })
    expect(scanPaperBtn).toBeInTheDocument()
    expect(scanPaperBtn).toHaveAttribute('href', '/paper-rx')
  })

  it('renders dispensing summary card with today stats', async () => {
    await renderDashboard()
    expect(screen.getByTestId('dispensing-summary-card')).toBeInTheDocument()
    expect(screen.getByText(/today.*dispens/i)).toBeInTheDocument()
  })

  it('renders sync queue card', async () => {
    await renderDashboard()
    expect(screen.getByTestId('sync-queue-card')).toBeInTheDocument()
  })

  it('renders recent dispensing list', async () => {
    await renderDashboard()
    expect(screen.getByTestId('recent-dispensing-list')).toBeInTheDocument()
  })

  it('renders connectivity status indicator', async () => {
    await renderDashboard()
    expect(screen.getByTestId('connectivity-indicator')).toBeInTheDocument()
  })

  it('shows dispensed count from local Dexie data', async () => {
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(3),
      }),
    })
    mockDispensesOrderBy.mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    })

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('dispensed-today-count')).toHaveTextContent('3')
    })
  })

  it('shows pending sync count from syncQueue', async () => {
    mockSyncQueueCount.mockResolvedValue(2)

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('pending-sync-count')).toHaveTextContent('2')
    })
  })

  it('shows failed sync count from syncQueue', async () => {
    mockSyncQueueToArray.mockResolvedValue([
      { id: 'sq1', resourceId: 'd1', retryCount: 3 },
    ])

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('failed-sync-count')).toHaveTextContent('1')
    })
  })

  it('auto-refreshes data every 30 seconds (AC #2)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    try {
      await renderDashboard()

      // Initial query called on mount
      const initialCallCount = mockSyncQueueCount.mock.calls.length

      // Advance 30 seconds — should trigger another query
      await vi.advanceTimersByTimeAsync(30_000)

      expect(mockSyncQueueCount.mock.calls.length).toBeGreaterThan(initialCallCount)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows recent dispenses with sync status', async () => {
    mockDispensesOrderBy.mockReturnValue({
      reverse: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            {
              id: 'd1',
              subject: { reference: 'Patient/pat1' },
              medicationCodeableConcept: { text: 'Amoxicillin 500mg' },
              whenHandedOver: '2026-05-11T10:00:00.000Z',
              meta: { lastUpdated: '2026-05-11T10:00:00.000Z' },
            },
          ]),
        }),
      }),
    })
    // Mark d1 as failed in sync queue (retryCount > 0 = failed)
    mockSyncQueueToArray.mockResolvedValue([{ id: 'sq1', resourceId: 'd1', retryCount: 3 }])

    await renderDashboard()

    await waitFor(() => {
      expect(screen.getByTestId('dispense-row-d1')).toBeInTheDocument()
    })
    const badge = screen.getByTestId('sync-badge-d1')
    expect(badge.className).toContain('red')
    expect(badge).toHaveTextContent('Failed')
  })
})

describe('DispensingSummaryCard', () => {
  it('renders today dispensing stats', async () => {
    const { DispensingSummaryCard } = await import(
      '@/components/pharmacy/DispensingSummaryCard'
    )
    render(
      <DispensingSummaryCard dispensedToday={5} pendingSync={2} failedSync={1} />,
    )

    expect(screen.getByTestId('dispensed-today-count')).toHaveTextContent('5')
    expect(screen.getByTestId('pending-sync-count')).toHaveTextContent('2')
    expect(screen.getByTestId('failed-sync-count')).toHaveTextContent('1')
  })
})

describe('SyncQueueCard', () => {
  it('renders amber when pending count > 0', async () => {
    const { SyncQueueCard } = await import(
      '@/components/pharmacy/SyncQueueCard'
    )
    render(<SyncQueueCard pendingCount={3} />)

    const card = screen.getByTestId('sync-queue-card')
    expect(card).toBeInTheDocument()
    expect(card.className).toContain('amber')
  })

  it('renders neutral when pending count is 0', async () => {
    const { SyncQueueCard } = await import(
      '@/components/pharmacy/SyncQueueCard'
    )
    render(<SyncQueueCard pendingCount={0} />)

    const card = screen.getByTestId('sync-queue-card')
    expect(card.className).not.toContain('amber')
  })
})

describe('RecentDispensingList', () => {
  it('renders up to 10 recent dispenses', async () => {
    const { RecentDispensingList } = await import(
      '@/components/pharmacy/RecentDispensingList'
    )
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      patientRef: `Patient ${i}`,
      medicationName: `Med ${i}`,
      whenHandedOver: new Date(2026, 4, 11, 10 + i).toISOString(),
      syncStatus: 'synced' as const,
    }))

    render(<RecentDispensingList items={items.slice(0, 10)} />)

    const rows = screen.getAllByTestId(/^dispense-row-/)
    expect(rows).toHaveLength(10)
  })

  it('shows red badge for failed sync entries', async () => {
    const { RecentDispensingList } = await import(
      '@/components/pharmacy/RecentDispensingList'
    )
    render(
      <RecentDispensingList
        items={[
          {
            id: 'd1',
            patientRef: 'Patient A',
            medicationName: 'Amoxicillin',
            whenHandedOver: new Date().toISOString(),
            syncStatus: 'failed',
          },
        ]}
      />,
    )

    const badge = screen.getByTestId('sync-badge-d1')
    expect(badge.className).toContain('red')
  })

  it('shows empty state when no dispenses', async () => {
    const { RecentDispensingList } = await import(
      '@/components/pharmacy/RecentDispensingList'
    )
    render(<RecentDispensingList items={[]} />)

    expect(screen.getByText(/no dispens/i)).toBeInTheDocument()
  })
})

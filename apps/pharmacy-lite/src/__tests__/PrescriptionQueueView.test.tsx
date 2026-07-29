import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Hoisted mocks
const {
  mockGetActiveItems,
  mockGetCompletedItems,
  mockGetFailedItems,
  mockSyncDispenseToHub,
  mockRouterPush,
  mockLoadPrescriptions,
  mockReset,
} = vi.hoisted(() => ({
  mockGetActiveItems: vi.fn().mockResolvedValue([]),
  mockGetCompletedItems: vi.fn().mockResolvedValue([]),
  mockGetFailedItems: vi.fn().mockResolvedValue([]),
  mockSyncDispenseToHub: vi.fn().mockResolvedValue({ synced: true, queued: false }),
  mockRouterPush: vi.fn(),
  mockLoadPrescriptions: vi.fn(),
  mockReset: vi.fn(),
}))

vi.mock('@/lib/queue-data', () => ({
  getActiveItems: mockGetActiveItems,
  getCompletedItems: mockGetCompletedItems,
  getFailedItems: mockGetFailedItems,
}))

vi.mock('@/lib/dispense-sync', () => ({
  syncDispenseToHub: mockSyncDispenseToHub,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/queue',
}))

vi.mock('@/stores/fulfillment-store', () => ({
  useFulfillmentStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ phase: 'empty', loadPrescriptions: mockLoadPrescriptions, reset: mockReset }),
    {
      getState: () => ({
        phase: 'empty',
        loadPrescriptions: mockLoadPrescriptions,
        reset: mockReset,
      }),
    },
  ),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: { email: 'pharm@test.com' }, isAuthenticated: true }),
    {
      getState: () => ({
        getAccessToken: vi.fn().mockResolvedValue('test-token'),
        getPractitionerRef: () => 'Practitioner/p1',
      }),
    },
  ),
}))

vi.mock('@/lib/db', () => ({
  db: {
    syncQueue: {
      get: vi.fn().mockResolvedValue(undefined),
      toArray: vi.fn().mockResolvedValue([]),
    },
    dispenses: {
      toArray: vi.fn().mockResolvedValue([]),
      where: vi.fn().mockReturnValue({
        aboveOrEqual: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([]),
        }),
      }),
    },
  },
}))

vi.mock('@/lib/prescription-verify', () => ({}))

function makeQueueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    patientFirstName: 'Ahmad',
    medicationCount: 1,
    phase: 'loaded' as const,
    timestamp: '2026-05-12T10:00:00.000Z',
    syncStatus: 'pending' as const,
    dispense: {
      id: 'item-1',
      resourceType: 'MedicationDispense',
      status: 'in-progress',
      subject: { reference: 'Patient/pat1', display: 'Ahmad' },
      medicationCodeableConcept: {
        coding: [{ system: 'urn:ultranos:medication', code: 'med1', display: 'Amoxicillin 500mg' }],
        text: 'Amoxicillin 500mg',
      },
      performer: [{ actor: { reference: 'Practitioner/p1' } }],
      authorizingPrescription: [{ reference: 'MedicationRequest/rx1' }],
      whenHandedOver: '2026-05-12T10:00:00.000Z',
      dosageInstruction: [{ text: '1 tablet, 3x per day' }],
      _ultranos: {
        hlcTimestamp: '2026-05-12T10:00:00.000Z:0:node1',
        createdAt: '2026-05-12T10:00:00.000Z',
        isOfflineCreated: false,
        originalPrescription: {
          id: 'rx1',
          med: 'med1',
          medN: 'Amoxicillin 500mg',
          medT: 'Amoxicillin 500mg',
          dos: { qty: 1, unit: 'capsule', freqN: 3, perU: 'd' },
          dur: 7,
          req: 'rx1',
          pat: 'pat1',
          at: '2026-05-12T10:00:00.000Z',
        },
        patientDisplayName: 'Ahmad',
        patientAge: 35,
      },
      meta: { lastUpdated: '2026-05-12T10:00:00.000Z', versionId: '1' },
    },
    ...overrides,
  }
}

describe('PrescriptionQueueView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetActiveItems.mockResolvedValue([])
    mockGetCompletedItems.mockResolvedValue([])
    mockGetFailedItems.mockResolvedValue([])
  })

  async function renderQueue() {
    const { PrescriptionQueueView } = await import(
      '@/components/pharmacy/PrescriptionQueueView'
    )
    return render(<PrescriptionQueueView />)
  }

  it('renders three tabs: Active, Completed (Today), Failed (AC #1)', async () => {
    await renderQueue()

    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /active/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /completed/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /failed/i })).toBeInTheDocument()
  })

  it('shows Active tab by default (AC #1)', async () => {
    await renderQueue()

    const activeTab = screen.getByRole('tab', { name: /active/i })
    expect(activeTab).toHaveAttribute('aria-selected', 'true')
  })

  it('tab buttons have id attributes matching aria-labelledby (P4)', async () => {
    await renderQueue()

    expect(screen.getByRole('tab', { name: /active/i })).toHaveAttribute('id', 'tab-active')
    expect(screen.getByRole('tab', { name: /completed/i })).toHaveAttribute('id', 'tab-completed')
    expect(screen.getByRole('tab', { name: /failed/i })).toHaveAttribute('id', 'tab-failed')
  })

  it('renders active items with patient name, medication count, phase badge, timestamp (AC #2)', async () => {
    mockGetActiveItems.mockResolvedValue([
      makeQueueItem({ id: 'a1', patientFirstName: 'Ahmad', medicationCount: 1, phase: 'loaded' }),
    ])

    await renderQueue()

    await waitFor(() => {
      expect(screen.getByTestId('queue-item-a1')).toBeInTheDocument()
    })
    expect(screen.getByText('Ahmad')).toBeInTheDocument()
    expect(screen.getByText(/1\s+meds/)).toBeInTheDocument()
    expect(screen.getByTestId('phase-badge-a1')).toBeInTheDocument()
  })

  it('clicking active item uses stored originalPrescription and navigates to /scan (AC #3, D1)', async () => {
    mockGetActiveItems.mockResolvedValue([
      makeQueueItem({ id: 'a2' }),
    ])

    await renderQueue()

    await waitFor(() => {
      expect(screen.getByTestId('queue-item-a2')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('queue-item-a2'))
    expect(mockLoadPrescriptions).toHaveBeenCalledWith(
      [expect.objectContaining({
        id: 'rx1',
        dos: { qty: 1, unit: 'capsule', freqN: 3, perU: 'd' },
      })],
      undefined,
      { name: 'Ahmad', age: 35 },
    )
    expect(mockRouterPush).toHaveBeenCalledWith('/scan')
  })

  it('switches to Completed tab and shows completed items with sync badges (AC #4)', async () => {
    mockGetCompletedItems.mockResolvedValue([
      makeQueueItem({ id: 'c1', phase: 'completed', syncStatus: 'synced' }),
    ])

    await renderQueue()

    fireEvent.click(screen.getByRole('tab', { name: /completed/i }))

    await waitFor(() => {
      expect(screen.getByTestId('queue-item-c1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('sync-badge-c1')).toHaveTextContent('Synced')
  })

  it('completed items are not interactive (P7)', async () => {
    mockGetCompletedItems.mockResolvedValue([
      makeQueueItem({ id: 'c2', phase: 'completed', syncStatus: 'synced' }),
    ])

    await renderQueue()
    fireEvent.click(screen.getByRole('tab', { name: /completed/i }))

    await waitFor(() => {
      expect(screen.getByTestId('queue-item-c2')).toBeInTheDocument()
    })
    // Completed items should not have role="button"
    expect(screen.getByTestId('queue-item-c2')).not.toHaveAttribute('role', 'button')
  })

  it('switches to Failed tab and shows Retry Sync button (AC #5)', async () => {
    mockGetFailedItems.mockResolvedValue([
      makeQueueItem({ id: 'f1', syncStatus: 'failed', syncQueueEntryId: 'sq-1' }),
    ])

    await renderQueue()

    fireEvent.click(screen.getByRole('tab', { name: /failed/i }))

    await waitFor(() => {
      expect(screen.getByTestId('queue-item-f1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('retry-btn-f1')).toBeInTheDocument()
    expect(screen.getByTestId('retry-btn-f1')).toHaveTextContent(/retry/i)
  })

  it('retry sync button calls syncDispenseToHub (AC #5)', async () => {
    mockGetFailedItems.mockResolvedValue([
      makeQueueItem({ id: 'f2', syncStatus: 'failed', syncQueueEntryId: 'sq-2' }),
    ])

    await renderQueue()
    fireEvent.click(screen.getByRole('tab', { name: /failed/i }))

    await waitFor(() => {
      expect(screen.getByTestId('retry-btn-f2')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('retry-btn-f2'))

    await waitFor(() => {
      expect(mockSyncDispenseToHub).toHaveBeenCalled()
    })
  })

  it('shows empty state when no items in tab', async () => {
    await renderQueue()

    // Empty state renders the i18n key for the active tab's no-data title
    // (global next-intl mock returns keys). Real app resolves queue.noActive.
    await waitFor(() => {
      expect(screen.getByText('noActive')).toBeInTheDocument()
    })
  })

  it('keeps the toolbar (tabs + search) visible when the list is empty', async () => {
    // Regression: the toolbar must render even with no items, so search/tabs
    // stay usable in the empty state (OPD-Lite list-page standard).
    await renderQueue()

    await waitFor(() => {
      expect(screen.getByText('noActive')).toBeInTheDocument()
    })
    expect(screen.getByRole('tab', { name: /active/i })).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText(/searchPlaceholder/i),
    ).toBeInTheDocument()
  })

  it('shows error state when loadData fails (P5)', async () => {
    mockGetActiveItems.mockRejectedValue(new Error('DB error'))

    await renderQueue()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i)
  })
})

describe('QueueItemCard', () => {
  it('renders phase badge with correct color for loaded phase', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const item = makeQueueItem({ id: 'card-1', phase: 'loaded' })
    render(<QueueItemCard item={item as never} onSelect={vi.fn()} />)

    const badge = screen.getByTestId('phase-badge-card-1')
    // Component uses semantic token: bg-primary/10 text-primary (not hardcoded 'blue')
    expect(badge.className).toContain('primary')
  })

  it('renders phase badge with correct color for reviewing phase', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const item = makeQueueItem({ id: 'card-2', phase: 'reviewing' })
    render(<QueueItemCard item={item as never} onSelect={vi.fn()} />)

    const badge = screen.getByTestId('phase-badge-card-2')
    // Component uses semantic token: bg-warning/10 text-warning (not hardcoded 'amber')
    expect(badge.className).toContain('warning')
  })

  it('renders phase badge with correct color for completed phase', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const item = makeQueueItem({ id: 'card-3', phase: 'completed' })
    render(<QueueItemCard item={item as never} onSelect={vi.fn()} />)

    const badge = screen.getByTestId('phase-badge-card-3')
    // Component uses semantic token: bg-success/10 text-success (not hardcoded 'green')
    expect(badge.className).toContain('success')
  })

  it('renders phase badge with animate-pulse for dispensing phase (D3)', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const item = makeQueueItem({ id: 'card-6', phase: 'dispensing' })
    render(<QueueItemCard item={item as never} onSelect={vi.fn()} />)

    const badge = screen.getByTestId('phase-badge-card-6')
    // Component uses semantic token: bg-warning/10 text-warning (not hardcoded 'amber')
    expect(badge.className).toContain('warning')
    expect(badge.className).toContain('animate-pulse')
  })

  it('shows sync status badge when provided', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const item = makeQueueItem({ id: 'card-4', syncStatus: 'failed' })
    render(<QueueItemCard item={item as never} onSelect={vi.fn()} showSyncBadge />)

    const badge = screen.getByTestId('sync-badge-card-4')
    expect(badge).toHaveTextContent('Failed')
    // Component uses bg-destructive/10 text-destructive (semantic token, not 'red')
    expect(badge.className).toContain('destructive')
  })

  it('calls onSelect when clicked', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const onSelect = vi.fn()
    const item = makeQueueItem({ id: 'card-5' })
    render(<QueueItemCard item={item as never} onSelect={onSelect} />)

    fireEvent.click(screen.getByTestId('queue-item-card-5'))
    expect(onSelect).toHaveBeenCalledWith(item)
  })

  it('is not interactive when onSelect is not provided (P7)', async () => {
    const { QueueItemCard } = await import(
      '@/components/pharmacy/QueueItemCard'
    )
    const item = makeQueueItem({ id: 'card-7' })
    render(<QueueItemCard item={item as never} />)

    const li = screen.getByTestId('queue-item-card-7')
    expect(li).not.toHaveAttribute('role', 'button')
    expect(li).not.toHaveAttribute('tabindex')
    expect(li.className).not.toContain('cursor-pointer')
  })
})

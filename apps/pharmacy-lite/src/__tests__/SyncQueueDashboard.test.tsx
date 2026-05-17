import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor, act } from '@testing-library/react'
import { db, type SyncQueueEntry } from '@/lib/db'

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
        },
        isAuthenticated: true,
        getAccessToken: vi.fn().mockResolvedValue('test-token'),
        getPractitionerRef: () => 'Practitioner/p1',
      }),
    },
  ),
}))

// Mock fetch for Hub API calls
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ result: { data: { json: { success: true } } } }),
  }),
)

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/sync',
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { SyncQueueDashboard } from '@/components/pharmacy/SyncQueueDashboard'
import { SyncQueueEntry as SyncQueueEntryComponent } from '@/components/pharmacy/SyncQueueEntry'

function makeSyncEntry(overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    resourceId: 'dispense-1',
    action: 'create',
    payload: JSON.stringify({ dispenseId: 'dispense-1', medicationCode: 'MED001' }),
    status: 'pending',
    hlcTimestamp: '2026-05-12T10:00:00.000Z:0000:node1',
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    retryCount: 0,
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ============================================================
// Task 1: Sync Dashboard renders categorized entries (AC #1)
// ============================================================
describe('SyncQueueDashboard — categorized entries (AC #1)', () => {
  it('renders pending entries in the Pending section', async () => {
    const entry = makeSyncEntry({ status: 'pending' })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/pending/i)).toBeInTheDocument()
    })
  })

  it('renders in-flight entries in the In-Flight section', async () => {
    const entry = makeSyncEntry({
      status: 'in-flight',
      lastAttemptAt: new Date().toISOString(),
    })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/in-flight/i)).toBeInTheDocument()
    })
  })

  it('renders failed entries in the Failed section', async () => {
    const entry = makeSyncEntry({ status: 'failed', retryCount: 3 })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/failed/i)).toBeInTheDocument()
    })
  })

  it('renders synced entries in the Recently Synced section', async () => {
    const entry = makeSyncEntry({
      status: 'synced',
      lastAttemptAt: new Date().toISOString(),
    })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/recently synced/i)).toBeInTheDocument()
    })
  })

  it('shows empty state when no entries exist', async () => {
    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/no items/i)).toBeInTheDocument()
    })
  })
})

// ============================================================
// SyncQueueEntry component (AC #1 — entry card details)
// ============================================================
describe('SyncQueueEntry — entry card (AC #1)', () => {
  it('shows resource type', () => {
    const entry = makeSyncEntry({ resourceType: 'MedicationDispense' })
    render(
      <SyncQueueEntryComponent
        entry={entry}
        onRetry={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/MedicationDispense/i)).toBeInTheDocument()
  })

  it('shows patient ref as opaque ID only — no name', () => {
    const entry = makeSyncEntry({
      resourceId: 'dispense-abc123',
      payload: JSON.stringify({
        dispenseId: 'dispense-abc123',
        patientRef: 'Patient/abc123',
      }),
    })
    render(
      <SyncQueueEntryComponent
        entry={entry}
        onRetry={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/Patient\/abc123/)).toBeInTheDocument()
  })

  it('shows relative enqueue timestamp', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const entry = makeSyncEntry({ createdAt: fiveMinAgo })
    render(
      <SyncQueueEntryComponent
        entry={entry}
        onRetry={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText(/5 min ago/i)).toBeInTheDocument()
  })

  it('shows retry count badge when retryCount > 0', () => {
    const entry = makeSyncEntry({ retryCount: 3, status: 'failed' })
    render(
      <SyncQueueEntryComponent
        entry={entry}
        onRetry={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders "Unknown" when patientRef is not a valid FHIR reference (PHI safety)', () => {
    const entry = makeSyncEntry({
      payload: JSON.stringify({
        dispenseId: 'dispense-1',
        patientRef: 'Mohammad Al-Rashidi',
      }),
    })
    render(
      <SyncQueueEntryComponent
        entry={entry}
        onRetry={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByText(/Mohammad/i)).not.toBeInTheDocument()
  })

  it('shows generic error message for failed entries', () => {
    const entry = makeSyncEntry({ status: 'failed', retryCount: 2 })
    render(
      <SyncQueueEntryComponent
        entry={entry}
        onRetry={vi.fn()}
        onReset={vi.fn()}
      />,
    )

    // Should show a generic error, not raw server details
    expect(
      screen.getByText(/network error|server error|sync failed/i),
    ).toBeInTheDocument()
  })
})

// ============================================================
// Task 3: Manual retry (AC #2, #3)
// ============================================================
describe('SyncQueueDashboard — manual retry (AC #2, #3)', () => {
  it('shows "Retry Now" button on failed entries', async () => {
    const entry = makeSyncEntry({ status: 'failed', retryCount: 1 })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry now/i })).toBeInTheDocument()
    })
  })

  it('"Retry Now" triggers sync attempt and updates entry', async () => {
    const entry = makeSyncEntry({ status: 'failed', retryCount: 1 })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry now/i })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry now/i }))
    })

    // After retry attempt, the entry should have been updated
    // (synced on success, or retryCount incremented on failure)
    await waitFor(async () => {
      const updated = await db.syncQueue.get(entry.id)
      expect(updated).toBeDefined()
      expect(updated!.lastAttemptAt).toBeDefined()
    })
  })

  it('shows "Retry All Failed" button when multiple failed entries exist', async () => {
    await db.syncQueue.bulkPut([
      makeSyncEntry({ status: 'failed', retryCount: 1 }),
      makeSyncEntry({ status: 'failed', retryCount: 2 }),
    ])

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry all failed/i })).toBeInTheDocument()
    })
  })

  it('disables retry buttons during in-flight operations', async () => {
    const entry = makeSyncEntry({ status: 'failed', retryCount: 1 })
    await db.syncQueue.put(entry)

    // Make fetch hang so we can check disabled state
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    )

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry now/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /retry now/i }))

    await waitFor(() => {
      const btn = screen.queryByRole('button', { name: /retry now/i })
      if (btn) expect(btn).toBeDisabled()
    })
  })
})

// ============================================================
// Task 4: Stale entry reset (AC #4)
// ============================================================
describe('SyncQueueDashboard — stale entry reset (AC #4)', () => {
  it('shows "Stale — Reset" for in-flight entries older than 2 minutes', async () => {
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    const entry = makeSyncEntry({
      status: 'in-flight',
      lastAttemptAt: threeMinAgo,
    })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stale.*reset/i })).toBeInTheDocument()
    })
  })

  it('does NOT show "Stale — Reset" for recent in-flight entries', async () => {
    const thirtySecsAgo = new Date(Date.now() - 30 * 1000).toISOString()
    const entry = makeSyncEntry({
      status: 'in-flight',
      lastAttemptAt: thirtySecsAgo,
    })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      // Should see the in-flight section but not the stale reset button
      expect(screen.getByText(/in-flight/i)).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /stale.*reset/i })).not.toBeInTheDocument()
  })

  it('"Stale — Reset" resets entry to pending', async () => {
    const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString()
    const entry = makeSyncEntry({
      status: 'in-flight',
      lastAttemptAt: threeMinAgo,
      retryCount: 2,
    })
    await db.syncQueue.put(entry)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /stale.*reset/i })).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /stale.*reset/i }))
    })

    await waitFor(async () => {
      const updated = await db.syncQueue.get(entry.id)
      expect(updated?.status).toBe('pending')
      expect(updated?.lastAttemptAt).toBeUndefined()
      // retryCount should be preserved
      expect(updated?.retryCount).toBe(2)
    })
  })
})

// ============================================================
// Task 5: Auto-cleanup of synced entries (AC #5)
// ============================================================
describe('SyncQueueDashboard — auto-cleanup (AC #5)', () => {
  it('removes synced entries older than 24 hours on load', async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    const recentEntry = makeSyncEntry({
      id: 'recent-synced',
      status: 'synced',
      lastAttemptAt: new Date().toISOString(),
    })
    const oldEntry = makeSyncEntry({
      id: 'old-synced',
      status: 'synced',
      lastAttemptAt: thirtyHoursAgo,
      createdAt: thirtyHoursAgo,
    })

    await db.syncQueue.bulkPut([recentEntry, oldEntry])

    render(<SyncQueueDashboard />)

    await waitFor(async () => {
      const oldRemaining = await db.syncQueue.get('old-synced')
      expect(oldRemaining).toBeUndefined()
    })

    // Recent synced entry should still exist
    const recentRemaining = await db.syncQueue.get('recent-synced')
    expect(recentRemaining).toBeDefined()
  })

  it('does not remove non-synced entries regardless of age', async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    const pendingOld = makeSyncEntry({
      id: 'old-pending',
      status: 'pending',
      createdAt: thirtyHoursAgo,
    })

    await db.syncQueue.put(pendingOld)

    render(<SyncQueueDashboard />)

    // Wait for cleanup to run
    await waitFor(() => {
      expect(screen.getByText(/pending/i)).toBeInTheDocument()
    })

    const remaining = await db.syncQueue.get('old-pending')
    expect(remaining).toBeDefined()
  })

  it('does not remove synced entries without lastAttemptAt regardless of createdAt age', async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString()
    const syncedNoAttempt = makeSyncEntry({
      id: 'synced-no-attempt',
      status: 'synced',
      createdAt: thirtyHoursAgo,
      // lastAttemptAt intentionally omitted
    })

    await db.syncQueue.put(syncedNoAttempt)

    render(<SyncQueueDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/recently synced/i)).toBeInTheDocument()
    })

    const remaining = await db.syncQueue.get('synced-no-attempt')
    expect(remaining).toBeDefined()
  })
})

// ============================================================
// Task 2: SyncPulse navigation (AC #1)
// ============================================================
describe('SyncPulse navigation (AC #1)', () => {
  it('SyncPulse click navigates to /sync', async () => {
    // Dynamically import after mocks are set up
    const { SyncPulse } = await import('@/components/pharmacy/SyncPulse')
    render(<SyncPulse />)

    const link = screen.getByTestId('sync-pulse-link')
    expect(link).toHaveAttribute('href', '/sync')
  })
})

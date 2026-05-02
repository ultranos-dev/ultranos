import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { SyncDashboard } from '../components/SyncDashboard'
import { SyncPulse } from '../components/SyncPulse'
import { useSyncStore } from '../stores/sync-store'
import { db, type SyncQueueEntry } from '../lib/db'

// Mock sync-worker so triggerDrain doesn't actually fire network requests
vi.mock('../lib/sync-worker', () => ({
  triggerDrain: vi.fn().mockResolvedValue(undefined),
}))

// Mock audit module to avoid dexie resolution issue in audit-logger
vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { DELETE_REQUEST: 'DELETE_REQUEST' },
  AuditResourceType: {},
}))

function makeSyncEntry(overrides: Partial<SyncQueueEntry> = {}): SyncQueueEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    resourceType: 'Encounter',
    resourceId: 'enc-abc12345-def6',
    action: 'create',
    payload: '{}',
    status: 'pending',
    hlcTimestamp: '000001700000000:00000:node-1',
    createdAt: new Date(Date.now() - 300_000).toISOString(),
    retryCount: 0,
    ...overrides,
  }
}

async function seedQueue(entries: SyncQueueEntry[]) {
  await db.syncQueue.clear()
  await db.syncQueue.bulkPut(entries)
}

describe('SyncDashboard', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await db.syncQueue.clear()
    // Reset store
    useSyncStore.setState({
      isPending: false,
      isError: false,
      lastSyncedAt: null,
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      isDraining: false,
      isDashboardOpen: true,
    })
  })

  afterEach(async () => {
    await db.syncQueue.clear()
    useSyncStore.setState({ isDashboardOpen: false })
  })

  // --- Task 1: Renders with pending items grouped by resource type (AC: 2, 3, 6) ---

  it('renders pending items grouped by resource type', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'e1', resourceType: 'Encounter', status: 'pending' }),
      makeSyncEntry({ id: 'e2', resourceType: 'Encounter', status: 'pending' }),
      makeSyncEntry({ id: 'o1', resourceType: 'Observation', status: 'pending' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Encounter')).toBeInTheDocument()
      expect(screen.getByText('Vitals')).toBeInTheDocument()
    })

    // Encounter group has 2 items
    const encounterBadge = screen.getByText('2')
    expect(encounterBadge).toBeInTheDocument()

    // Vitals group has 1 item
    const vitalsBadge = screen.getByText('1')
    expect(vitalsBadge).toBeInTheDocument()
  })

  it('shows summary header with counts', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'p1', status: 'pending' }),
      makeSyncEntry({ id: 'f1', status: 'failed' }),
      makeSyncEntry({ id: 'c1', status: 'failed', conflictFlag: true }),
    ])
    useSyncStore.setState({ lastSyncedAt: new Date().toISOString() })

    render(<SyncDashboard />)

    await waitFor(() => {
      const summary = screen.getByTestId('sync-summary')
      expect(within(summary).getByText(/1 pending/)).toBeInTheDocument()
      expect(within(summary).getByText(/1 failed/)).toBeInTheDocument()
      expect(within(summary).getByText(/1 conflicts/)).toBeInTheDocument()
      expect(within(summary).getByText(/Last sync/)).toBeInTheDocument()
    })
  })

  it('shows empty state when queue is empty', async () => {
    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/All synced/)).toBeInTheDocument()
    })
  })

  it('does not render when dashboard is closed', () => {
    useSyncStore.setState({ isDashboardOpen: false })
    render(<SyncDashboard />)
    expect(screen.queryByTestId('sync-dashboard')).not.toBeInTheDocument()
  })

  // --- Task 2: Failed item actions (AC: 4) ---

  it('shows retry button for failed items; clicking resets status', async () => {
    const { triggerDrain } = await import('../lib/sync-worker')

    await seedQueue([
      makeSyncEntry({ id: 'f1', status: 'failed', failureReason: 'HTTP 500' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('retry-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('retry-btn'))

    await waitFor(async () => {
      const entry = await db.syncQueue.get('f1')
      expect(entry?.status).toBe('pending')
      expect(entry?.retryCount).toBe(0)
    })

    expect(triggerDrain).toHaveBeenCalled()
  })

  it('shows failure reason for failed items', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'f1', status: 'failed', failureReason: 'HTTP 500' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('failure-reason')).toHaveTextContent('Server error')
    })
  })

  it('shows discard button with confirmation flow', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'f1', status: 'failed' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('discard-btn')).toBeInTheDocument()
    })

    // Click discard — should show confirmation
    fireEvent.click(screen.getByTestId('discard-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('confirm-discard-btn')).toBeInTheDocument()
    })

    // Confirm discard
    fireEvent.click(screen.getByTestId('confirm-discard-btn'))

    await waitFor(async () => {
      const entry = await db.syncQueue.get('f1')
      expect(entry).toBeUndefined()
    })
  })

  it('retry all failed resets all failed items', async () => {
    const { triggerDrain } = await import('../lib/sync-worker')

    await seedQueue([
      makeSyncEntry({ id: 'f1', status: 'failed' }),
      makeSyncEntry({ id: 'f2', status: 'failed' }),
      makeSyncEntry({ id: 'p1', status: 'pending' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('retry-all-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('retry-all-btn'))

    await waitFor(async () => {
      const f1 = await db.syncQueue.get('f1')
      const f2 = await db.syncQueue.get('f2')
      expect(f1?.status).toBe('pending')
      expect(f2?.status).toBe('pending')
    })

    expect(triggerDrain).toHaveBeenCalled()
  })

  // --- Task 3: Conflict resolution UI (AC: 5) ---

  it('shows conflict warning badge for items with conflictFlag', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'c1', status: 'failed', conflictFlag: true }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('badge-conflict')).toBeInTheDocument()
    })
  })

  it('shows resolve conflict link for conflict items', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'c1', resourceId: 'enc-12345678', status: 'failed', conflictFlag: true }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      const link = screen.getByTestId('resolve-conflict-link')
      expect(link).toBeInTheDocument()
      expect(link).toHaveTextContent('Resolve')
    })
  })

  // --- Task 4: Sync Now button (AC: 7) ---

  it('Sync Now triggers drain worker', async () => {
    const { triggerDrain } = await import('../lib/sync-worker')

    await seedQueue([
      makeSyncEntry({ id: 'p1', status: 'pending' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByTestId('sync-now-btn')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('sync-now-btn'))

    await waitFor(() => {
      expect(triggerDrain).toHaveBeenCalled()
    })
  })

  it('Sync Now disabled when offline', async () => {
    const original = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    await seedQueue([
      makeSyncEntry({ id: 'p1', status: 'pending' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      const btn = screen.getByTestId('sync-now-btn')
      expect(btn).toBeDisabled()
    })

    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true })
  })

  // --- Task 5: PHI Safety (AC: 9) ---

  it('no PHI appears in rendered output', async () => {
    await seedQueue([
      makeSyncEntry({
        id: 'phi-test',
        resourceType: 'MedicationRequest',
        resourceId: 'med-secret-patient-name-ahmad',
        status: 'failed',
        failureReason: 'Patient Ahmad bin Khalid has a conflict',
        payload: JSON.stringify({ name: 'Ahmad bin Khalid', diagnosis: 'Diabetes' }),
      }),
    ])

    render(<SyncDashboard />)

    // Wait for items to load from Dexie
    await waitFor(() => {
      expect(screen.getByTestId('failure-reason')).toBeInTheDocument()
    })

    const dashboard = screen.getByTestId('sync-dashboard')
    const text = dashboard.textContent ?? ''

    // No patient names should appear
    expect(text).not.toContain('Ahmad')
    expect(text).not.toContain('Khalid')
    expect(text).not.toContain('Diabetes')
    // Should use generic labels
    expect(text).toContain('Prescription')
    expect(text).toContain('med-secr') // Only short ID prefix
  })

  // --- Task 6: Dashboard updates when sync store changes (AC: 8) ---

  it('dashboard updates when sync store changes', async () => {
    await seedQueue([
      makeSyncEntry({ id: 'p1', status: 'pending' }),
    ])

    render(<SyncDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/1 pending/)).toBeInTheDocument()
    })

    // Simulate sync store update
    useSyncStore.setState({ lastSyncedAt: new Date().toISOString() })

    await waitFor(() => {
      expect(screen.getByText(/Last sync/)).toBeInTheDocument()
    })
  })
})

describe('SyncPulse', () => {
  beforeEach(() => {
    useSyncStore.setState({
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
      isDashboardOpen: false,
    })
  })

  it('renders green pulse when all synced', () => {
    render(<SyncPulse />)
    const dot = screen.getByTestId('sync-pulse-dot')
    expect(dot.className).toContain('bg-green-500')
  })

  it('renders yellow pulse when items pending', () => {
    useSyncStore.setState({ pendingCount: 5 })
    render(<SyncPulse />)
    const dot = screen.getByTestId('sync-pulse-dot')
    expect(dot.className).toContain('bg-yellow-500')
  })

  it('renders red pulse when failures exist', () => {
    useSyncStore.setState({ failedCount: 2 })
    render(<SyncPulse />)
    const dot = screen.getByTestId('sync-pulse-dot')
    expect(dot.className).toContain('bg-red-500')
  })

  it('renders red pulse when conflicts exist', () => {
    useSyncStore.setState({ conflictCount: 1 })
    render(<SyncPulse />)
    const dot = screen.getByTestId('sync-pulse-dot')
    expect(dot.className).toContain('bg-red-500')
  })

  it('shows badge with pending count', () => {
    useSyncStore.setState({ pendingCount: 7 })
    render(<SyncPulse />)
    expect(screen.getByTestId('sync-pulse-badge')).toHaveTextContent('7')
  })

  it('toggles dashboard open on click', () => {
    render(<SyncPulse />)
    const pulse = screen.getByTestId('sync-pulse')
    fireEvent.click(pulse)
    expect(useSyncStore.getState().isDashboardOpen).toBe(true)
  })

  it('does not show badge when count is zero', () => {
    render(<SyncPulse />)
    expect(screen.queryByTestId('sync-pulse-badge')).not.toBeInTheDocument()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SyncPulse } from '@/components/pharmacy/SyncPulse'
import { useSyncStore } from '@/stores/sync-store'

// Mock @/lib/db so SyncPulse's Dexie syncQueue queries don't hit the real DB
vi.mock('@/lib/db', () => ({
  db: {
    syncQueue: {
      where: vi.fn().mockReturnValue({
        anyOf: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
        equals: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      }),
    },
  },
}))

// Mock auth session store (cascading dep via dispense-sync)
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: { userId: 'u1', practitionerId: 'p1', role: 'PHARMACIST', sessionId: 's1' },
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
    }),
  },
}))

// Mock fetch to prevent unhandled rejections
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ result: { data: { json: { success: true } } } }),
}))

const defaultSyncState = {
  isPending: false,
  isError: false,
  lastSyncedAt: null,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  isDashboardOpen: false,
  syncError: null,
}

beforeEach(() => {
  useSyncStore.setState(defaultSyncState)
})

describe('SyncPulse', () => {
  it('renders success pulse when no pending sync items', () => {
    render(<SyncPulse />)

    const pulseDot = screen.getByTestId('sync-pulse-dot')
    expect(pulseDot).toBeInTheDocument()
    // All clear → bg-success (semantic token)
    expect(pulseDot.className).toContain('success')
  })

  it('renders warning pulse when sync is pending (AC 4)', () => {
    // SyncPulse reads from useSyncStore (not useFulfillmentStore)
    useSyncStore.setState({ ...defaultSyncState, pendingCount: 2, isPending: true })

    render(<SyncPulse />)

    const pulseDot = screen.getByTestId('sync-pulse-dot')
    // Pending → bg-warning (semantic token, not 'amber')
    expect(pulseDot.className).toContain('warning')
  })

  it('renders destructive pulse when there are sync failures', () => {
    useSyncStore.setState({ ...defaultSyncState, failedCount: 1, isError: true })

    render(<SyncPulse />)

    const pulseDot = screen.getByTestId('sync-pulse-dot')
    // Failed → bg-destructive
    expect(pulseDot.className).toContain('destructive')
  })

  it('returns to success state when sync completes', () => {
    useSyncStore.setState({ ...defaultSyncState, pendingCount: 0, failedCount: 0, isPending: false, isError: false })

    render(<SyncPulse />)

    const pulseDot = screen.getByTestId('sync-pulse-dot')
    expect(pulseDot.className).toContain('success')
  })

  it('shows total badge count when items are pending or failed', () => {
    useSyncStore.setState({ ...defaultSyncState, pendingCount: 3, isPending: true })

    render(<SyncPulse />)

    // Badge shows totalBadge = pendingCount + failedCount
    const badge = screen.getByTestId('sync-pulse-badge')
    expect(badge).toHaveTextContent('3')
  })

  it('has accessible label describing sync status', () => {
    render(<SyncPulse />)

    const pulse = screen.getByTestId('sync-pulse')
    expect(pulse.getAttribute('aria-label')).toBeTruthy()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react-native'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { useSyncStore } from '@/store/sync-store'

let mockState: BannerState = { status: 'idle', lastSyncAt: '2026-06-13T12:00:00Z', syncedCount: 0 }

vi.mock('@/store/sync-store', () => ({
  useSyncStore: (selector?: (s: BannerState) => unknown) => {
    if (typeof selector === 'function') {
      return selector(mockState)
    }
    return mockState
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'sync.syncingCount' && opts?.count !== undefined) {
        return `Syncing catalog\u2026 ${opts.count} drugs`
      }
      const map: Record<string, string> = {
        'sync.syncing': 'Syncing catalog\u2026',
        'sync.failed': 'Sync failed \u2014 showing cached data',
        'sync.notSynced': 'Catalog not yet synced \u2014 connect to network',
      }
      return map[key] ?? key
    },
  }),
}))

type BannerState = { status: 'idle' | 'syncing' | 'error'; lastSyncAt: string | null; syncedCount: number }

function setState(state: BannerState) {
  mockState = state
}

beforeEach(() => {
  setState({ status: 'idle', lastSyncAt: '2026-06-13T12:00:00Z', syncedCount: 0 })
})

describe('SyncStatusBanner', () => {
  it('renders nothing when idle and catalog is synced', () => {
    render(<SyncStatusBanner />)
    expect(screen.queryByText(/Syncing|Sync failed|not yet synced/i)).toBeNull()
  })

  it('renders plain syncing text when status=syncing and syncedCount=0', () => {
    setState({ status: 'syncing', lastSyncAt: null, syncedCount: 0 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Syncing catalog\u2026')).toBeTruthy()
  })

  it('renders syncing text with drug count when syncedCount > 0', () => {
    setState({ status: 'syncing', lastSyncAt: null, syncedCount: 200 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Syncing catalog\u2026 200 drugs')).toBeTruthy()
  })

  it('renders error text when status=error', () => {
    setState({ status: 'error', lastSyncAt: null, syncedCount: 0 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Sync failed \u2014 showing cached data')).toBeTruthy()
  })

  it('renders not-synced warning when idle and lastSyncAt is null', () => {
    setState({ status: 'idle', lastSyncAt: null, syncedCount: 0 })
    render(<SyncStatusBanner />)
    expect(screen.getByText('Catalog not yet synced \u2014 connect to network')).toBeTruthy()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-native'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'

const mockSetStatus = vi.fn()
const mockSetSyncedCount = vi.fn()
const mockSetLastSync = vi.fn()
const mockRunSync = vi.fn()
const mockRunBrandsSync = vi.fn()
const mockNetFetch = vi.fn()

vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}), isDatabaseReady: () => true }))
vi.mock('@/sync/catalog-sync', () => ({ runSync: (...a: unknown[]) => mockRunSync(...a) }))
vi.mock('@/sync/brands-sync', () => ({ runBrandsSync: (...a: unknown[]) => mockRunBrandsSync(...a) }))
vi.mock('@react-native-community/netinfo', () => ({ default: { fetch: () => mockNetFetch() } }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: vi.fn() }))

type AuthState = { isAuthenticated: boolean; token: string | null }
type SyncState = {
  lastVersion: number; status: 'idle' | 'syncing' | 'error'; lastSyncAt: string | null
  setStatus: typeof mockSetStatus; setSyncedCount: typeof mockSetSyncedCount; setLastSync: typeof mockSetLastSync
}

function setAuth(s: AuthState) { vi.mocked(useAuthStore).mockImplementation((sel: (x: AuthState) => unknown) => sel(s)) }
function setSync(s: SyncState) { vi.mocked(useSyncStore).mockImplementation((sel: (x: SyncState) => unknown) => sel(s)) }

const baseSync: SyncState = {
  lastVersion: 0, status: 'idle', lastSyncAt: null,
  setStatus: mockSetStatus, setSyncedCount: mockSetSyncedCount, setLastSync: mockSetLastSync,
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth({ isAuthenticated: true, token: 'tok' })
  setSync(baseSync)
  mockRunSync.mockResolvedValue({ synced: 100, version: 7 })
  mockRunBrandsSync.mockResolvedValue({ brands: 0, presentations: 0 })
  mockNetFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true })
})

const mount = async () => { await act(async () => { renderHook(() => useAutoSync()) }) }

describe('useAutoSync', () => {
  it('cold start (lastVersion=0): shows progress and full-syncs', async () => {
    await mount()
    expect(mockSetStatus).toHaveBeenCalledWith('syncing')
    expect(mockRunSync).toHaveBeenCalledTimes(1)
    expect(mockRunBrandsSync).toHaveBeenCalledTimes(1)
    expect(mockSetLastSync).toHaveBeenCalledWith(7, expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/))
  })

  it('returning user (lastVersion>0): delta-syncs silently (no progress UI)', async () => {
    setSync({ ...baseSync, lastVersion: 5, lastSyncAt: '2026-01-01T00:00:00Z' })
    await mount()
    expect(mockRunSync).toHaveBeenCalledTimes(1)
    expect(mockSetStatus).not.toHaveBeenCalledWith('syncing')
    expect(mockSetLastSync).toHaveBeenCalled()
  })

  it('throttles: skips a delta sync if synced within the last 15 min', async () => {
    setSync({ ...baseSync, lastVersion: 5, lastSyncAt: new Date().toISOString() })
    await mount()
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('skips when offline', async () => {
    setSync({ ...baseSync, lastVersion: 5, lastSyncAt: '2026-01-01T00:00:00Z' })
    mockNetFetch.mockResolvedValue({ isConnected: false, isInternetReachable: false })
    await mount()
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('sets status "error" only on a cold-start failure', async () => {
    mockRunSync.mockRejectedValue(new Error('network'))
    await mount()
    expect(mockSetStatus).toHaveBeenCalledWith('error')
  })

  it('does not surface error on a returning-user (silent) failure', async () => {
    setSync({ ...baseSync, lastVersion: 5, lastSyncAt: '2026-01-01T00:00:00Z' })
    mockRunSync.mockRejectedValue(new Error('network'))
    await mount()
    expect(mockSetStatus).not.toHaveBeenCalledWith('error')
  })

  it('does NOT sync when unauthenticated', async () => {
    setAuth({ isAuthenticated: false, token: null })
    await mount()
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('does NOT sync when a sync is already in progress', async () => {
    setSync({ ...baseSync, status: 'syncing' })
    await mount()
    expect(mockRunSync).not.toHaveBeenCalled()
  })
})

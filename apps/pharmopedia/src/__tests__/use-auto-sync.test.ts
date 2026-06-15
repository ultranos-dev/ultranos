import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-native'
import { useAutoSync } from '@/hooks/useAutoSync'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'

const mockSetStatus = vi.fn()
const mockSetSyncedCount = vi.fn()
const mockSetLastSync = vi.fn()
const mockRunSync = vi.fn()

vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))
vi.mock('@/sync/catalog-sync', () => ({
  runSync: (...args: unknown[]) => mockRunSync(...args),
}))
vi.mock('@/store/auth-store', () => ({ useAuthStore: vi.fn() }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: vi.fn() }))

type AuthState = { isAuthenticated: boolean; token: string | null }
type SyncState = {
  lastVersion: number
  status: 'idle' | 'syncing' | 'error'
  setStatus: typeof mockSetStatus
  setSyncedCount: typeof mockSetSyncedCount
  setLastSync: typeof mockSetLastSync
}

function setAuth(state: AuthState) {
  vi.mocked(useAuthStore).mockImplementation((sel: (s: AuthState) => unknown) => sel(state))
}
function setSync(state: SyncState) {
  vi.mocked(useSyncStore).mockImplementation((sel: (s: SyncState) => unknown) => sel(state))
}

const defaultSync: SyncState = {
  lastVersion: 0,
  status: 'idle',
  setStatus: mockSetStatus,
  setSyncedCount: mockSetSyncedCount,
  setLastSync: mockSetLastSync,
}

beforeEach(() => {
  vi.clearAllMocks()
  setAuth({ isAuthenticated: true, token: 'tok' })
  setSync(defaultSync)
})

describe('useAutoSync', () => {
  it('triggers sync when authenticated, token present, lastVersion=0', async () => {
    mockRunSync.mockResolvedValue({ synced: 100, version: 1 })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockSetStatus).toHaveBeenCalledWith('syncing')
    expect(mockRunSync).toHaveBeenCalledTimes(1)
  })

  it('calls setLastSync with version and ISO timestamp on success', async () => {
    mockRunSync.mockResolvedValue({ synced: 100, version: 3 })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockSetLastSync).toHaveBeenCalledWith(3, expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/))
  })

  it('calls setStatus("error") when runSync rejects', async () => {
    mockRunSync.mockRejectedValue(new Error('network'))
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockSetStatus).toHaveBeenCalledWith('error')
  })

  it('does NOT trigger when lastVersion > 0', async () => {
    setSync({ ...defaultSync, lastVersion: 5 })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('does NOT trigger when not authenticated', async () => {
    setAuth({ isAuthenticated: false, token: null })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockRunSync).not.toHaveBeenCalled()
  })

  it('does NOT trigger when already syncing', async () => {
    setSync({ ...defaultSync, status: 'syncing' })
    await act(async () => { renderHook(() => useAutoSync()) })
    expect(mockRunSync).not.toHaveBeenCalled()
  })
})

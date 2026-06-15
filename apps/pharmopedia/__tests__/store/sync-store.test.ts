import { act, renderHook } from '@testing-library/react-native'
import { useSyncStore } from '@/store/sync-store'

describe('sync-store', () => {
  beforeEach(() => useSyncStore.setState({
    status: 'idle', lastSyncAt: null, lastVersion: 0,
  }))

  it('starts idle with version 0', () => {
    const { result } = renderHook(() => useSyncStore())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastVersion).toBe(0)
  })

  it('setStatus updates status', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => result.current.setStatus('syncing'))
    expect(result.current.status).toBe('syncing')
  })

  it('setLastSync updates version and timestamp', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => result.current.setLastSync(42, '2026-06-12T10:00:00Z'))
    expect(result.current.lastVersion).toBe(42)
    expect(result.current.lastSyncAt).toBe('2026-06-12T10:00:00Z')
    expect(result.current.status).toBe('idle')
  })

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => { result.current.setStatus('error'); result.current.setLastSync(5, 'ts') })
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastVersion).toBe(0)
    expect(result.current.lastSyncAt).toBeNull()
  })
})

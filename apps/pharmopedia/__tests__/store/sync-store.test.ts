import { act, renderHook } from '@testing-library/react-native'
import { useSyncStore } from '@/store/sync-store'

describe('sync-store', () => {
  beforeEach(() => useSyncStore.setState({
    status: 'idle', lastSyncAt: null, lastVersion: 0, brandsIncomplete: false,
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

  // Uses getState() rather than renderHook+act because the jest-expo `act` shim
  // does not flush zustand external-store updates in this environment (the same
  // limitation affects the setLastSync/reset renderHook cases).
  it('setBrandsIncomplete flags and clears incomplete brand data', () => {
    expect(useSyncStore.getState().brandsIncomplete).toBe(false)
    useSyncStore.getState().setBrandsIncomplete(true)
    expect(useSyncStore.getState().brandsIncomplete).toBe(true)
    useSyncStore.getState().setBrandsIncomplete(false)
    expect(useSyncStore.getState().brandsIncomplete).toBe(false)
  })

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useSyncStore())
    act(() => { result.current.setStatus('error'); result.current.setLastSync(5, 'ts'); result.current.setBrandsIncomplete(true) })
    act(() => result.current.reset())
    expect(result.current.status).toBe('idle')
    expect(result.current.lastVersion).toBe(0)
    expect(result.current.lastSyncAt).toBeNull()
    expect(result.current.brandsIncomplete).toBe(false)
  })

  it('reset clears brandsIncomplete', () => {
    useSyncStore.getState().setBrandsIncomplete(true)
    useSyncStore.getState().reset()
    expect(useSyncStore.getState().brandsIncomplete).toBe(false)
  })
})

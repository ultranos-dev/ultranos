import { act, renderHook } from '@testing-library/react-native'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { clearCatalog } from '@/db/drug-catalog'
import * as SQLite from 'expo-sqlite'

jest.mock('@/db/drug-catalog', () => ({ clearCatalog: jest.fn() }))
jest.mock('expo-sqlite')
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      refreshSession: jest.fn(),
    },
  },
}))

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      token: null, user: null, isAuthenticated: false, initialized: false,
    })
    const { supabase } = jest.requireMock('@/lib/supabase')
    supabase.auth.refreshSession.mockReset()
  })

  it('starts unauthenticated', () => {
    const { result } = renderHook(() => useAuthStore())
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('login sets token, user, and isAuthenticated', () => {
    const { result } = renderHook(() => useAuthStore())
    act(() => {
      result.current.login(
        'test-jwt-token',
        { sub: 'user-123', role: 'DOCTOR', facilityId: undefined }
      )
    })
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.token).toBe('test-jwt-token')
    expect(result.current.user?.role).toBe('DOCTOR')
  })

  it('logout clears token and user', async () => {
    const mockDb = {} as SQLite.SQLiteDatabase
    const { result } = renderHook(() => useAuthStore())
    act(() => {
      result.current.login('tok', { sub: 'u1', role: 'PATIENT' })
    })
    await act(async () => {
      await result.current.logout(mockDb)
    })
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
    expect(clearCatalog).toHaveBeenCalledWith(mockDb)
  })

  it('logout resets sync-store', async () => {
    const mockDb = {} as SQLite.SQLiteDatabase
    // Set sync-store to a non-initial state
    useSyncStore.setState({ status: 'syncing', lastVersion: 10, lastSyncAt: '2026-06-12T00:00:00Z' })

    const { result } = renderHook(() => useAuthStore())
    act(() => result.current.login('tok', { sub: 'u1', role: 'DOCTOR' }))
    await act(async () => { await result.current.logout(mockDb) })

    expect(useSyncStore.getState().status).toBe('idle')
    expect(useSyncStore.getState().lastVersion).toBe(0)
  })

  it('refreshToken updates token on success', async () => {
    const { supabase } = jest.requireMock('@/lib/supabase')
    supabase.auth.refreshSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'new-token',
          user: {
            id: 'user-123',
            app_metadata: { role: 'PHARMACIST', facilityId: 'fac-1' },
          },
        },
      },
      error: null,
    })

    const mockDb = {} as SQLite.SQLiteDatabase
    const { result } = renderHook(() => useAuthStore())
    act(() => result.current.login('old-token', { sub: 'user-123', role: 'DOCTOR' }))

    await act(async () => { await result.current.refreshToken(mockDb) })

    expect(result.current.token).toBe('new-token')
    expect(result.current.user?.role).toBe('PHARMACIST')
    expect(result.current.user?.facilityId).toBe('fac-1')
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('refreshToken calls logout on session expiry', async () => {
    const { supabase } = jest.requireMock('@/lib/supabase')
    supabase.auth.refreshSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Token expired' },
    })

    const mockDb = {} as SQLite.SQLiteDatabase
    const { result } = renderHook(() => useAuthStore())
    act(() => result.current.login('old-token', { sub: 'u1', role: 'DOCTOR' }))

    await act(async () => { await result.current.refreshToken(mockDb) })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.token).toBeNull()
  })
})

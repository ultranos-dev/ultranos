/**
 * Tests for useSessionExpiry hook — Story 18.2, Task 6.
 *
 * AC #4: Expired session (90 days) forces re-login via OTP.
 */
import { AppState } from 'react-native'
import { renderHook, act } from '@testing-library/react-native'
import { useSessionExpiry } from '../src/hooks/useSessionExpiry'
import { useAuthStore } from '../src/stores/auth-store'

// Mock supabase — clearAuthTokens is now async
jest.mock('../src/lib/supabase', () => ({
  clearAuthTokens: jest.fn().mockResolvedValue(undefined),
}))

// Mock encrypted-db
jest.mock('../src/lib/encrypted-db', () => ({
  closeDatabase: jest.fn().mockResolvedValue(undefined),
}))

let appStateCallback: ((state: string) => void) | null = null

// Capture AppState listener
jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
  appStateCallback = callback as (state: string) => void
  return { remove: jest.fn() }
})

beforeEach(() => {
  appStateCallback = null
  jest.clearAllMocks()
  useAuthStore.setState({
    isAuthenticated: false,
    userId: null,
    sessionExpiresAt: null,
    isFirstLogin: false,
    biometricEnrolled: false,
    initialized: true,
  })
})

describe('useSessionExpiry', () => {
  it('clears session immediately on mount when already expired', () => {
    const expiredAt = new Date(Date.now() - 1000).toISOString()
    useAuthStore.setState({
      isAuthenticated: true,
      userId: 'test-user',
      sessionExpiresAt: expiredAt,
    })

    renderHook(() => useSessionExpiry())

    // Session should be cleared immediately on mount (no foreground transition needed)
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.userId).toBeNull()
  })

  it('clears session when expired and app returns to foreground', () => {
    jest.useFakeTimers()
    const baseTime = Date.now()

    // Session expires 2 seconds from now — valid at mount
    const expiresAt = new Date(baseTime + 2000).toISOString()
    useAuthStore.setState({
      isAuthenticated: true,
      userId: 'test-user',
      sessionExpiresAt: expiresAt,
    })

    renderHook(() => useSessionExpiry())

    // Listener should be registered since session was valid at mount
    expect(appStateCallback).not.toBeNull()

    // Advance time past expiry
    jest.advanceTimersByTime(3000)

    // Simulate foreground
    act(() => {
      appStateCallback!('active')
    })

    // Session should be cleared
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(false)
    expect(state.userId).toBeNull()

    jest.useRealTimers()
  })

  it('does not clear valid session on foreground', () => {
    const validExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    useAuthStore.setState({
      isAuthenticated: true,
      userId: 'test-user',
      sessionExpiresAt: validExpiry,
    })

    renderHook(() => useSessionExpiry())

    act(() => {
      appStateCallback!('active')
    })

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.userId).toBe('test-user')
  })

  it('does nothing when not authenticated', () => {
    renderHook(() => useSessionExpiry())

    // appStateCallback may not be registered if not authenticated
    if (appStateCallback) {
      act(() => {
        appStateCallback!('active')
      })
    }

    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

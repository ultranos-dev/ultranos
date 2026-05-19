/**
 * Tests for auth-store.ts — Story 18.2, Task 2.
 *
 * Verifies session lifecycle: setSession, clearSession, restoreSession,
 * biometric enrollment, and session expiry detection.
 */
import * as SecureStore from 'expo-secure-store'
import { useAuthStore } from '../src/stores/auth-store'

// Reset store between tests
beforeEach(() => {
  useAuthStore.setState({
    isAuthenticated: false,
    userId: null,
    sessionExpiresAt: null,
    isFirstLogin: false,
    biometricEnrolled: false,
    initialized: false,
  })
  jest.clearAllMocks()
})

describe('auth-store', () => {
  describe('setSession', () => {
    it('sets authenticated state with userId and expiry', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      useAuthStore.getState().setSession('user-123', expiresAt, false)

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.userId).toBe('user-123')
      expect(state.sessionExpiresAt).toBe(expiresAt)
      expect(state.isFirstLogin).toBe(false)
    })

    it('marks first login correctly', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      useAuthStore.getState().setSession('user-456', expiresAt, true)

      expect(useAuthStore.getState().isFirstLogin).toBe(true)
    })

    it('persists auth metadata to SecureStore', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      useAuthStore.getState().setSession('user-789', expiresAt, false)

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'ultranos_auth_meta',
        expect.stringContaining('user-789'),
        expect.objectContaining({
          keychainAccessible: 'WHEN_PASSCODE_SET_THIS_DEVICE_ONLY',
        }),
      )
    })

    it('never stores phone numbers — only userId (AC #12)', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      useAuthStore.getState().setSession('uuid-no-phone', expiresAt, false)

      const persistedArg = (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1]
      expect(persistedArg).not.toContain('+93')
      expect(persistedArg).not.toContain('+971')
      expect(persistedArg).toContain('uuid-no-phone')
    })
  })

  describe('clearSession', () => {
    it('resets all auth state', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      useAuthStore.getState().setSession('user-123', expiresAt, true)
      useAuthStore.getState().clearSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.userId).toBeNull()
      expect(state.sessionExpiresAt).toBeNull()
      expect(state.isFirstLogin).toBe(false)
      expect(state.biometricEnrolled).toBe(false)
    })

    it('deletes persisted auth metadata', () => {
      useAuthStore.getState().clearSession()
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ultranos_auth_meta')
    })
  })

  describe('setBiometricEnrolled', () => {
    it('marks biometric as enrolled', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      useAuthStore.getState().setSession('user-123', expiresAt, true)
      useAuthStore.getState().setBiometricEnrolled()

      expect(useAuthStore.getState().biometricEnrolled).toBe(true)
    })
  })

  describe('restoreSession', () => {
    it('restores valid session from SecureStore', async () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          userId: 'restored-user',
          sessionExpiresAt: expiresAt,
          biometricEnrolled: true,
        }),
      )

      await useAuthStore.getState().restoreSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.userId).toBe('restored-user')
      expect(state.biometricEnrolled).toBe(true)
      expect(state.initialized).toBe(true)
      expect(state.isFirstLogin).toBe(false) // Restored sessions are never first login
    })

    it('clears expired sessions', async () => {
      const expiredAt = new Date(Date.now() - 1000).toISOString()
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          userId: 'expired-user',
          sessionExpiresAt: expiredAt,
          biometricEnrolled: false,
        }),
      )

      await useAuthStore.getState().restoreSession()

      const state = useAuthStore.getState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.userId).toBeNull()
      expect(state.initialized).toBe(true)
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ultranos_auth_meta')
    })

    it('handles missing auth metadata gracefully', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(null)

      await useAuthStore.getState().restoreSession()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().initialized).toBe(true)
    })

    it('handles corrupted auth metadata gracefully', async () => {
      ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('not-json')

      await useAuthStore.getState().restoreSession()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().initialized).toBe(true)
    })
  })
})

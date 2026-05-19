/**
 * Hook to enforce 90-day session expiry on app foreground and while active.
 *
 * Story 18.2, Task 6: Session duration enforcement.
 *
 * On each return to foreground AND periodically while active,
 * checks if sessionExpiresAt has passed.
 * If expired: clears session, clears local data, forces re-login via OTP.
 * Background re-lock after 3 minutes is handled by useDatabaseUnlock (existing).
 */
import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useAuthStore } from '@/stores/auth-store'
import { clearAuthTokens } from '@/lib/supabase'
import { closeDatabase } from '@/lib/encrypted-db'

const EXPIRY_CHECK_INTERVAL_MS = 60 * 1000 // Check every 60 seconds while active

function isSessionExpired(sessionExpiresAt: string): boolean {
  return new Date(sessionExpiresAt) <= new Date()
}

function handleExpiry(clearSession: () => void): void {
  clearAuthTokens().catch(() => {})
  closeDatabase().catch(() => {})
  clearSession()
}

export function useSessionExpiry(): void {
  const sessionExpiresAt = useAuthStore((s) => s.sessionExpiresAt)
  const clearSession = useAuthStore((s) => s.clearSession)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated || !sessionExpiresAt) return

    // Check immediately on mount
    if (isSessionExpired(sessionExpiresAt)) {
      handleExpiry(clearSession)
      return
    }

    // Check on each foreground transition
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return
      if (isSessionExpired(sessionExpiresAt)) {
        handleExpiry(clearSession)
      }
    })

    // Periodic check while app remains active
    const interval = setInterval(() => {
      if (isSessionExpired(sessionExpiresAt)) {
        handleExpiry(clearSession)
      }
    }, EXPIRY_CHECK_INTERVAL_MS)

    return () => {
      subscription.remove()
      clearInterval(interval)
    }
  }, [isAuthenticated, sessionExpiresAt, clearSession])
}

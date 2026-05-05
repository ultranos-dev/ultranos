'use client'

import { useCallback, type ReactNode } from 'react'
import {
  SessionManagerProvider,
  SESSION_DURATIONS,
  INACTIVITY_TIMEOUT,
} from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export function SessionTimeoutWrapper({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)

  const handleExpired = useCallback(async () => {
    // Clear auth state
    useAuthSessionStore.getState().clearSession()

    // Sign out of Supabase — await to ensure refresh token is revoked before redirect
    // Wrap in try/finally to guarantee redirect even if signOut throws
    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
      // Hard redirect to login (destroys Zustand state — intentional)
      window.location.href = '/login'
    }
  }, [])

  const handleReAuth = useCallback(async (password: string): Promise<boolean> => {
    try {
      const supabase = getSupabaseBrowserClient()
      // Try authoritative source first, fall back to store email if token expired
      let email: string | undefined
      try {
        const { data: { user } } = await supabase.auth.getUser()
        email = user?.email ?? undefined
      } catch {
        // Token likely expired — fall back to store email
      }
      if (!email) {
        email = useAuthSessionStore.getState().session?.email
      }
      if (!email) return false
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      return !error
    } catch {
      return false
    }
  }, [])

  if (!isAuthenticated || !session) {
    return <>{children}</>
  }

  return (
    <SessionManagerProvider
      maxDurationMs={SESSION_DURATIONS[session.role as keyof typeof SESSION_DURATIONS] ?? SESSION_DURATIONS.LAB_TECH}
      inactivityMs={INACTIVITY_TIMEOUT}
      userEmail={session.email}
      onExpired={handleExpired}
      onReAuth={handleReAuth}
    >
      {children}
    </SessionManagerProvider>
  )
}

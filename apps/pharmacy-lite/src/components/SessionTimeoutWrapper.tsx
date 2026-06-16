'use client'

import { useCallback, type ReactNode } from 'react'
import {
  SessionManagerProvider,
  SESSION_DURATIONS,
  INACTIVITY_TIMEOUT,
} from '@ultranos/ui-kit'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { clearPhiTables, purgeSyncedQueueEntries } from '@/lib/phi-cleanup'
import { stopAuditDrain } from '@/lib/audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export function SessionTimeoutWrapper({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)

  const handleExpired = useCallback(async () => {
    // 1. Clear PHI tables and purge synced queue entries
    await Promise.all([clearPhiTables(), purgeSyncedQueueEntries()])
    // 2. Wipe encryption key (prevents decryption of any residual cached data)
    encryptionKeyStore.wipe()
    // 3. Stop audit drain (prevents further API calls with stale token)
    stopAuditDrain()
    // 4. Clear auth session (removes practitioner ref, isAuthenticated)
    useAuthSessionStore.getState().clearSession()
    // 5. Sign out of Supabase — await to ensure refresh token is revoked before redirect
    // 6. Hard redirect to login (destroys all in-memory state) — in finally to guarantee redirect even if signOut throws
    try {
      await getSupabaseBrowserClient().auth.signOut()
    } finally {
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
      maxDurationMs={SESSION_DURATIONS[session.role as keyof typeof SESSION_DURATIONS] ?? SESSION_DURATIONS.PHARMACIST}
      inactivityMs={INACTIVITY_TIMEOUT}
      userEmail={session.email}
      onExpired={handleExpired}
      onReAuth={handleReAuth}
    >
      {children}
    </SessionManagerProvider>
  )
}

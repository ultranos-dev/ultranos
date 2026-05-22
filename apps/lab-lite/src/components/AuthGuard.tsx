'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEntitlementCheck } from '@/hooks/useEntitlementCheck'
import { EntitlementGate } from '@ultranos/ui-kit'

export function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'

  useEffect(() => {
    if (isLoginPage) return

    let cancelled = false

    async function checkSession() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()

        if (cancelled) return

        if (!data.session) {
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/login?returnUrl=${returnUrl}`
          return
        }

        if (!useAuthSessionStore.getState().isAuthenticated) {
          const user = data.session.user
          // Extract session_id from JWT for audit trail continuity
          let sessionId = ''
          try {
            const jwt = data.session.access_token
            const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
            const payload = JSON.parse(atob(base64))
            sessionId = payload.session_id ?? ''
          } catch {
            // Malformed JWT — use empty sessionId rather than blocking auth
          }
          useAuthSessionStore.getState().setSession({
            userId: user.id,
            practitionerId: user.user_metadata?.practitioner_id ?? user.id,
            role: 'LAB_TECH',
            sessionId,
            email: user.email ?? '',
          })
        }

        setReady(true)
      } catch {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/login?returnUrl=${returnUrl}`
      }
    }

    checkSession()

    return () => {
      cancelled = true
    }
  }, [isLoginPage])

  useEntitlementCheck('LAB_LITE')
  const entitlementStatus = useAuthSessionStore((s) => s.entitlementStatus)
  const clearSession = useAuthSessionStore((s) => s.clearSession)

  function handleSignOut() {
    clearSession()
    window.location.href = '/login'
  }

  if (isLoginPage) return <>{children}</>
  if (!ready) return null

  return (
    <EntitlementGate
      moduleCode="LAB_LITE"
      moduleName="Lab Diagnostics Portal"
      status={entitlementStatus}
      onSignOut={handleSignOut}
    >
      {children}
    </EntitlementGate>
  )
}

'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  // Skip auth check entirely on the login page
  const isLoginPage =
    typeof window !== 'undefined' && window.location.pathname === '/login'

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

        // Rehydrate Zustand store if empty (hard refresh scenario)
        if (!useAuthSessionStore.getState().isAuthenticated) {
          try {
            const jwt = data.session.access_token
            const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
            const payload = JSON.parse(atob(base64))
            useAuthSessionStore.getState().setSession({
              userId: payload.sub,
              practitionerId: payload.practitioner_id ?? payload.sub,
              role: payload.role ?? '',
              sessionId: payload.session_id ?? '',
              email: data.session.user?.email ?? '',
            })
          } catch {
            // Malformed JWT — force re-login
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.href = `/login?returnUrl=${returnUrl}`
            return
          }
        }

        setReady(true)
      } catch {
        // Session check failed — redirect to login
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/login?returnUrl=${returnUrl}`
      }
    }

    checkSession()

    return () => {
      cancelled = true
    }
  }, [isLoginPage])

  if (isLoginPage) return <>{children}</>
  if (!ready) return null

  return <>{children}</>
}

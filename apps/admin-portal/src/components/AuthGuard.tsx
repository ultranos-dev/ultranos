'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { setAccessToken } from '@/lib/trpc'
import { Sidebar } from '@/components/Sidebar'

type GuardState = 'loading' | 'authenticated' | 'unauthenticated' | 'access-denied' | 'public'

/** Admin session max age: 4 hours per NFR9. */
const SESSION_MAX_AGE_S = 4 * 60 * 60

const PUBLIC_PATHS = ['/', '/login', '/register']

export function AuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>('loading')

  useEffect(() => {
    const isPublicPage = PUBLIC_PATHS.includes(window.location.pathname)

    if (isPublicPage) {
      setState('public') // render children without sidebar for public pages
      return
    }

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

        // Verify ADMIN role and session age from JWT
        const jwt = data.session.access_token
        const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(base64))
        // App-level role is in user_metadata (Supabase top-level `role` is always "authenticated")
        const userMeta = payload.user_metadata ?? {}
        const role = ((userMeta.role as string) ?? '').toUpperCase()

        // Enforce 4h session max age (NFR9)
        const iat = payload.iat as number | undefined
        if (iat && Math.floor(Date.now() / 1000) - iat > SESSION_MAX_AGE_S) {
          await getSupabaseBrowserClient().auth.signOut()
          window.location.href = '/login'
          return
        }

        if (role !== 'ADMIN') {
          setState('access-denied')
          return
        }

        // Rehydrate Zustand store if empty (hard refresh scenario)
        if (!useAuthSessionStore.getState().isAuthenticated) {
          useAuthSessionStore.getState().setSession({
            userId: payload.sub,
            practitionerId: payload.practitioner_id ?? payload.sub,
            role,
            sessionId: payload.session_id ?? '',
            email: data.session.user?.email ?? '',
          })
        }

        // Store token in memory (never sessionStorage/localStorage)
        setAccessToken(jwt)
        setState('authenticated')
      } catch {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/login?returnUrl=${returnUrl}`
      }
    }

    checkSession()

    // Listen for token refresh events to keep the in-memory token current
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && session) {
          setAccessToken(session.access_token)
        }
        if (event === 'SIGNED_OUT') {
          useAuthSessionStore.getState().clearSession()
          setAccessToken(null)
          window.location.href = '/login'
        }
      },
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  if (state === 'loading') return null

  if (state === 'access-denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="w-full max-w-md rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-xl font-bold text-red-800">Access Denied</h1>
          <p className="mt-2 text-sm text-red-700">
            You do not have admin privileges. This portal is restricted to users with the ADMIN role.
          </p>
          <button
            type="button"
            onClick={() => {
              useAuthSessionStore.getState().clearSession()
              setAccessToken(null)
              getSupabaseBrowserClient().auth.signOut()
              window.location.href = '/login'
            }}
            className="mt-4 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 hover:scale-[1.02] transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  if (state === 'public') {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-6 lg:p-8">{children}</main>
    </div>
  )
}

'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { setAccessToken, trpc } from '@/lib/trpc'
import { Sidebar } from '@/components/Sidebar'
import { useSidebarCollapse } from '@/hooks/useSidebarCollapse'
import { Button } from '@/components/ui/button'

type GuardState = 'loading' | 'authenticated' | 'unauthenticated' | 'access-denied' | 'public'

/** Paths that bypass the trial-expired interstitial so the admin can set up billing. */
const TRIAL_BYPASS_PATHS = ['/subscriptions', '/subscriptions/billing']

/** Admin session max age: 4 hours per NFR9. */
const SESSION_MAX_AGE_S = 4 * 60 * 60

const PUBLIC_PATHS = ['/', '/login', '/register']

export function AuthGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuardState>('loading')
  const [trialExpired, setTrialExpired] = useState(false)

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

        // Check if the org's trial has expired
        trpc.subscription.getOrgSubscriptions
          .query()
          .then((r) => {
            const org = r.organization as {
              status: string
              trialEndsAt?: string | null
            }
            if (
              org.status === 'TRIAL' &&
              org.trialEndsAt &&
              new Date(org.trialEndsAt) < new Date()
            ) {
              setTrialExpired(true)
            }
          })
          .catch(() => {})
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md rounded-2xl border border-danger-subtle bg-destructive/10 p-8 text-center">
          <h1 className="text-xl font-bold text-destructive">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You do not have admin privileges. This portal is restricted to users with the ADMIN role.
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={() => {
              useAuthSessionStore.getState().clearSession()
              setAccessToken(null)
              getSupabaseBrowserClient().auth.signOut()
              window.location.href = '/login'
            }}
          >
            Sign Out
          </Button>
        </div>
      </div>
    )
  }

  if (state === 'public') {
    return <>{children}</>
  }

  // Trial-expired interstitial — allow subscription pages through so admin can set up billing
  if (trialExpired && !TRIAL_BYPASS_PATHS.includes(window.location.pathname)) {
    return <TrialExpiredInterstitial />
  }

  return (
    <AuthenticatedShell>{children}</AuthenticatedShell>
  )
}

function TrialExpiredInterstitial() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-card">
      <div className="w-full max-w-md rounded-2xl border border-border bg-popover p-8 text-center shadow-card">
        <h1 className="text-xl font-bold text-foreground">Your free trial has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a payment method to continue using Ultranos.
        </p>
        <Button
          asChild
          className="mt-6"
        >
          <a href="/subscriptions/billing">Set Up Billing</a>
        </Button>
        <div className="mt-3">
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={() => {
              useAuthSessionStore.getState().clearSession()
              setAccessToken(null)
              getSupabaseBrowserClient().auth.signOut()
              window.location.href = '/login'
            }}
          >
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  )
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useSidebarCollapse()

  return (
    <div className="flex min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex-1 flex flex-col min-w-0">
        {children}
      </div>
    </div>
  )
}

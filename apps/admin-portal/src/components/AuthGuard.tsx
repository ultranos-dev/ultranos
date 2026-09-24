'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { setAccessToken, getAccessToken, trpc } from '@/lib/trpc'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { NotificationToaster } from '@/components/NotificationToaster'
import { Button } from '@/components/ui/button'

type GuardState = 'loading' | 'authenticated' | 'unauthenticated' | 'access-denied' | 'public'

/** Paths that bypass the trial-expired interstitial so the admin can set up billing. */
const TRIAL_BYPASS_PATHS = ['/subscriptions', '/subscriptions/billing']

/** Admin session max age: 4 hours per NFR9. */
const SESSION_MAX_AGE_S = 4 * 60 * 60

/**
 * Story 62.2 (M-ADM-3): inactivity timeout. After this many ms with no user
 * interaction on a clinical/admin view, the session is signed out. CLAUDE.md
 * auth policy: "30-min inactivity → re-auth required on clinical views".
 */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000

/** How often the continuous session watchdog re-checks the 4h cap. */
const SESSION_CHECK_INTERVAL_MS = 30 * 1000

/**
 * Story 62.2 (M-ADM-4): the binary ADMIN role was split into SUPERADMIN and
 * ORG_ADMIN. The portal admits any administrator variant; per-page/per-action
 * gating for cross-org features is enforced hub-side. Legacy ADMIN is retained
 * for zero-regression.
 */
const ADMIN_PORTAL_ROLES = new Set(['ADMIN', 'ORG_ADMIN', 'SUPERADMIN', 'PLATFORM_ADMIN'])

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password']

/** Centralized sign-out used by the access-denied UI, the watchdog, and events. */
function forceSignOut(): void {
  useAuthSessionStore.getState().clearSession()
  setAccessToken(null)
  void getSupabaseBrowserClient().auth.signOut()
  window.location.href = '/login'
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const t = useTranslations('auth')
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
        // Story 56.1: app-level role lives in app_metadata (server-authoritative;
        // Supabase top-level `role` is always "authenticated"). user_metadata is a
        // TEMPORARY fallback for sessions minted before the claim migration —
        // client reads are display/routing only; enforcement is hub-side.
        const appMeta = payload.app_metadata ?? {}
        const userMeta = payload.user_metadata ?? {}
        const role = (((appMeta.role ?? userMeta.role) as string) ?? '').toUpperCase()

        // Enforce 4h session max age (NFR9)
        const iat = payload.iat as number | undefined
        if (iat && Math.floor(Date.now() / 1000) - iat > SESSION_MAX_AGE_S) {
          await getSupabaseBrowserClient().auth.signOut()
          window.location.href = '/login'
          return
        }

        if (!ADMIN_PORTAL_ROLES.has(role)) {
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
            name: data.session.user?.user_metadata?.full_name ?? data.session.user?.user_metadata?.name ?? '',
          })
        }

        // Store token in memory (never sessionStorage/localStorage)
        setAccessToken(jwt)
        setState('authenticated')

        // Check if the org's trial has expired
        trpc.subscription.getOrgSubscriptions
          .query()
          .then((r: { organization?: { status: string; trialEndsAt?: string | null } }) => {
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
      (event: AuthChangeEvent, session: Session | null) => {
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

  // Story 62.2 (M-ADM-3): continuous session enforcement. Once authenticated,
  // a watchdog interval re-checks the 4h absolute cap (JWT `iat`) AND an
  // inactivity timeout on every tick — the prior code only checked the cap once
  // at mount, so a session left open past 4h stayed usable until a full reload.
  // Any user interaction resets the inactivity clock. Reaching either limit
  // signs the user out immediately.
  useEffect(() => {
    if (state !== 'authenticated') return

    let lastActivity = Date.now()
    const markActivity = () => {
      lastActivity = Date.now()
    }
    const activityEvents: Array<keyof WindowEventMap> = [
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'pointerdown',
    ]
    for (const evt of activityEvents) {
      window.addEventListener(evt, markActivity, { passive: true })
    }

    const readIatSeconds = (): number | null => {
      const token = getAccessToken()
      if (!token) return null
      try {
        const part = token.split('.')[1]
        if (!part) return null
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
        const payload = JSON.parse(atob(base64)) as { iat?: number }
        return typeof payload.iat === 'number' ? payload.iat : null
      } catch {
        return null
      }
    }

    const interval = window.setInterval(() => {
      // Absolute 4h cap — enforced continuously, not just at mount.
      const iat = readIatSeconds()
      if (iat && Math.floor(Date.now() / 1000) - iat > SESSION_MAX_AGE_S) {
        forceSignOut()
        return
      }
      // Inactivity timeout.
      if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
        forceSignOut()
      }
    }, SESSION_CHECK_INTERVAL_MS)

    return () => {
      window.clearInterval(interval)
      for (const evt of activityEvents) {
        window.removeEventListener(evt, markActivity)
      }
    }
  }, [state])

  if (state === 'loading') return null

  if (state === 'access-denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md rounded-2xl border border-danger-subtle bg-destructive/10 p-8 text-center">
          <h1 className="text-xl font-bold text-destructive">{t('accessDeniedTitle')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('accessDeniedBody')}
          </p>
          <Button
            variant="destructive"
            className="mt-4"
            onClick={forceSignOut}
          >
            {t('signOut')}
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
  const t = useTranslations('auth')
  return (
    <div className="flex min-h-screen items-center justify-center bg-card">
      <div className="w-full max-w-md rounded-2xl border border-border bg-popover p-8 text-center shadow-card">
        <h1 className="text-xl font-bold text-foreground">{t('trialExpiredTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('trialExpiredBody')}
        </p>
        <Button
          asChild
          className="mt-6"
        >
          <a href="/subscriptions/billing">{t('setUpBilling')}</a>
        </Button>
        <div className="mt-3">
          <Button
            variant="link"
            className="text-muted-foreground"
            onClick={forceSignOut}
          >
            {t('signOut')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AuthenticatedShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <BreadcrumbHeader />
          <main id="main-content" className="flex flex-1 flex-col gap-4 p-4">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
      {/* NotificationToaster mounts once per authenticated session — outside sidebar */}
      <NotificationToaster />
    </TooltipProvider>
  )
}

'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { generateSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { useEntitlementCheck } from '@/hooks/useEntitlementCheck'
import { EntitlementGate } from '@ultranos/ui-kit'

export function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [pathname, setPathname] = useState('')

  // Resolve pathname client-side only to avoid SSR/hydration mismatch
  useEffect(() => {
    setPathname(window.location.pathname)
  }, [])

  const isPublicPage = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password'
  const isKycPage = pathname === '/kyc'

  useEffect(() => {
    if (!pathname || isPublicPage) return

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
            const base64 = jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
            const payload = JSON.parse(atob(base64))
            useAuthSessionStore.getState().setSession({
              userId: payload.sub,
              practitionerId: payload.practitioner_id ?? payload.sub,
              role: (payload.role !== 'authenticated' ? payload.role : null) ?? data.session.user?.user_metadata?.role ?? '',
              sessionId: payload.session_id ?? '',
              email: data.session.user?.email ?? '',
              name: (() => {
                const m = data.session.user?.user_metadata
                return m?.full_name ?? m?.name ??
                  ((m?.given_name || m?.family_name) ? `${m?.given_name ?? ''} ${m?.family_name ?? ''}`.trim() : '')
              })(),
              kycStatus: payload.kyc_status ?? payload.app_metadata?.kyc_status,
            })
          } catch {
            // Malformed JWT — force re-login
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.href = `/login?returnUrl=${returnUrl}`
            return
          }
        }

        // Ensure encryption key exists (lost on page refresh since it's memory-only)
        if (!encryptionKeyStore.isReady()) {
          const encKey = await generateSessionKey()
          encryptionKeyStore.setKey(encKey)
        }

        // Story 22.5 AC #8: Redirect PENDING_VERIFICATION/REJECTED/REQUEST_MORE_INFO to KYC page
        // Only applies to DOCTOR role — other provider roles have different credentialing flows
        const currentSession = useAuthSessionStore.getState().session
        const kycStatus = currentSession?.kycStatus
        const role = currentSession?.role?.toUpperCase()
        const currentPath = window.location.pathname

        if (
          role === 'DOCTOR' &&
          kycStatus &&
          ['PENDING_VERIFICATION', 'REJECTED', 'REQUEST_MORE_INFO'].includes(kycStatus) &&
          currentPath !== '/kyc'
        ) {
          window.location.href = '/kyc'
          return
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
  }, [pathname, isPublicPage])

  useEntitlementCheck('OPD_LITE')
  const entitlementStatus = useAuthSessionStore((s) => s.entitlementStatus)
  const clearSession = useAuthSessionStore((s) => s.clearSession)

  function handleSignOut() {
    clearSession()
    window.location.href = '/login'
  }

  if (isPublicPage) return <>{children}</>
  // KYC page: session check still runs (auth verified), but skip entitlement gate
  if (isKycPage && ready) return <>{children}</>
  if (!ready) return null

  return (
    <EntitlementGate
      moduleCode="OPD_LITE"
      moduleName="OPD Lite"
      status={entitlementStatus}
      onSignOut={handleSignOut}
    >
      {children}
    </EntitlementGate>
  )
}

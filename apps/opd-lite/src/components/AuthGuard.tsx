'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { deriveSessionKey } from '@ultranos/crypto'
import { encryptionKeyStore, getOrCreateDeviceSalt } from '@/lib/encryption-key-store'
import { clearPhiTables, clearSyncedQueueEntries } from '@/lib/phi-cleanup'
import { migrateUnencryptedQueueEntries } from '@/lib/sync-queue-migration'
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

        // Derive or re-derive the encryption key from the JWT sub + device salt.
        // PBKDF2 (Story 28.4): same key is re-derived on page refresh while session is valid.
        // Migration note: stale data from old random keys will fail to decrypt in the Dexie
        // proxy (Story 28.1), which calls clearPhiTables() so data re-populates from Hub.
        if (!encryptionKeyStore.isReady()) {
          try {
            const derivedKey = await deriveSessionKey(data.session.user.id, getOrCreateDeviceSalt())
            encryptionKeyStore.setKey(derivedKey)
          } catch {
            // Derivation failed — SubtleCrypto unavailable (app must be served over HTTPS)
            console.error('[auth] Encryption key derivation failed — ensure app is served over HTTPS')
            throw new Error('Key derivation unavailable')
          }
          // Encrypt any pre-existing plaintext queue entries from before Story 28.3
          void migrateUnencryptedQueueEntries()
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
    void clearSyncedQueueEntries() // fire-and-forget; PHI surface reduction before key wipe
    clearPhiTables()
      .catch(() => { /* Dexie unavailable — proceed with logout */ })
      .finally(() => {
        encryptionKeyStore.wipe()
        clearSession()
        window.location.href = '/login'
      })
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

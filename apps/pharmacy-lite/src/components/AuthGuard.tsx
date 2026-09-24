'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEntitlementCheck } from '@/hooks/useEntitlementCheck'
import { EntitlementGate } from '@ultranos/ui-kit'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { establishSessionKey } from '@/lib/encryption-key-vnext'
import { getDevicePin } from '@/lib/device-pin'
import { migrateLegacyEncryptedData } from '@/lib/encryption-migration-vnext'
import { clearPhiTables } from '@/lib/phi-cleanup'

export function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  const pathname = usePathname()
  const isPublicPage = pathname === '/login' || pathname === '/forgot-password' || pathname === '/reset-password'

  useEffect(() => {
    if (isPublicPage) return

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

        // Establish the at-rest encryption key (Story 61.2 vNext, dual-wrapped DEK).
        // establishSessionKey tries hub-secret online unlock → PIN offline unlock →
        // legacy deterministic key fallback (backward compat). Never plaintext.
        if (!encryptionKeyStore.isReady()) {
          let scheme: 'vnext-online' | 'vnext-offline' | 'legacy'
          try {
            scheme = await establishSessionKey({
              sub: data.session.user.id,
              getPin: getDevicePin,
            })
          } catch {
            // Establishment failed — SubtleCrypto unavailable (app must be served over HTTPS)
            console.error('[auth] Encryption key establishment failed — ensure app is served over HTTPS')
            throw new Error('Key derivation unavailable')
          }
          // Story 61.2: after vNext online unlock, re-encrypt legacy v1 records to v2.
          if (scheme === 'vnext-online') {
            void migrateLegacyEncryptedData()
          }
        }

        if (!useAuthSessionStore.getState().isAuthenticated) {
          try {
            const jwt = data.session.access_token
            const jwtPart = jwt.split('.')[1]
            if (!jwtPart) throw new Error('Invalid JWT format')
            const base64 = jwtPart.replace(/-/g, '+').replace(/_/g, '/')
            const payload = JSON.parse(atob(base64))
            useAuthSessionStore.getState().setSession({
              userId: payload.sub,
              practitionerId: payload.practitioner_id ?? payload.sub,
              // Story 56.1: app_metadata first (server-authoritative); user_metadata is a
              // temporary pre-migration fallback. Display/routing only — enforcement is hub-side.
              role: (payload.role !== 'authenticated' ? payload.role : null) ?? data.session.user?.app_metadata?.role ?? data.session.user?.user_metadata?.role ?? '',
              sessionId: payload.session_id ?? '',
              email: data.session.user?.email ?? '',
              name: (() => {
                const m = data.session.user?.user_metadata
                return m?.full_name ?? m?.name ??
                  ((m?.given_name || m?.family_name) ? `${m?.given_name ?? ''} ${m?.family_name ?? ''}`.trim() : '')
              })(),
            })
          } catch {
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.href = `/login?returnUrl=${returnUrl}`
            return
          }
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
  }, [isPublicPage])

  useEntitlementCheck('PHARMACY_LITE')
  const entitlementStatus = useAuthSessionStore((s) => s.entitlementStatus)
  const clearSession = useAuthSessionStore((s) => s.clearSession)

  function handleSignOut() {
    clearPhiTables()
      .catch(() => { /* Dexie unavailable — proceed with logout */ })
      .finally(() => {
        encryptionKeyStore.wipe()
        clearSession()
        window.location.href = '/login'
      })
  }

  if (isPublicPage) return <>{children}</>
  if (!ready) return null

  return (
    <EntitlementGate
      moduleCode="PHARMACY_LITE"
      moduleName="Pharmacy Lite"
      status={entitlementStatus}
      onSignOut={handleSignOut}
    >
      {children}
    </EntitlementGate>
  )
}

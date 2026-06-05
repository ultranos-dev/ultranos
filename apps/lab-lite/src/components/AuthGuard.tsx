'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { LabRole } from '@ultranos/shared-types'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEntitlementCheck } from '@/hooks/useEntitlementCheck'
import { EntitlementGate } from '@ultranos/ui-kit'
import { getMyRole } from '@/lib/trpc'
import { getPendingHandoverReports, type HandoverReport } from '@/lib/db'
import { HandoverAcknowledgment } from '@/components/shift/HandoverAcknowledgment'

export function AuthGuard({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [pendingHandover, setPendingHandover] = useState<HandoverReport | null>(null)
  const session = useAuthSessionStore((s) => s.session)

  useEffect(() => {

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
          // Fetch lab role from Hub API (Story 42.1 AC 3, 6)
          let labRole: LabRole | null = null
          try {
            const token = data.session.access_token
            const roleResult = await getMyRole(token)
            labRole = roleResult.labRole
            // Cache for offline use (labRole is not PHI), keyed per user to prevent cross-user contamination
            if (labRole) {
              try { localStorage.setItem(`ultranos_lab_role_${user.id}`, labRole) } catch { /* quota */ }
            }
          } catch {
            // Offline-safe: use cached role if available, fall back to LAB_TECH
            const cached = (() => { try { return localStorage.getItem(`ultranos_lab_role_${user.id}`) } catch { return null } })()
            labRole = (cached as LabRole) ?? 'LAB_TECH' as LabRole
          }

          useAuthSessionStore.getState().setSession({
            userId: user.id,
            practitionerId: user.user_metadata?.practitioner_id ?? user.id,
            role: 'LAB_TECH',
            sessionId,
            email: user.email ?? '',
            name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? '',
            labRole,
          })
        }

        setReady(true)

        // Check for pending handover reports after session is established.
        // Filter out reports where the current user is the outgoing tech (D2: no self-acknowledge).
        try {
          const pending = await getPendingHandoverReports()
          const userId = useAuthSessionStore.getState().session?.userId
          const incoming = pending.find((r) => r.outgoingTechId !== userId)
          if (!cancelled && incoming) setPendingHandover(incoming)
        } catch {
          // Offline or Dexie unavailable — skip handover check
        }
      } catch {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
        window.location.href = `/login?returnUrl=${returnUrl}`
      }
    }

    checkSession()

    return () => {
      cancelled = true
    }
  }, [])

  useEntitlementCheck('LAB_LITE')
  const entitlementStatus = useAuthSessionStore((s) => s.entitlementStatus)
  const clearSession = useAuthSessionStore((s) => s.clearSession)

  function handleSignOut() {
    const userId = useAuthSessionStore.getState().session?.userId
    clearSession()
    if (userId) {
      try { localStorage.removeItem(`ultranos_lab_role_${userId}`) } catch { /* noop */ }
    }
    window.location.href = '/login'
  }

  if (!ready) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-5 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <EntitlementGate
      moduleCode="LAB_LITE"
      moduleName="Lab Diagnostics Portal"
      status={entitlementStatus}
      onSignOut={handleSignOut}
    >
      {pendingHandover && session && (
        <HandoverAcknowledgment
          report={pendingHandover}
          incomingTechId={session.userId}
          incomingTechName={session.email?.split('@')[0] ?? 'Technician'}
          onAcknowledged={() => setPendingHandover(null)}
        />
      )}
      {children}
    </EntitlementGate>
  )
}

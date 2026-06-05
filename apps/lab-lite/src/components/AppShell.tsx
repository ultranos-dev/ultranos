'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { PageHeader } from '@/components/PageHeader'
import { InstallPrompt } from '@/components/InstallPrompt'
import { AchievementNotification } from '@/components/achievements/AchievementNotification'
import { useAchievementScheduler } from '@/hooks/useAchievementScheduler'
import type { SchedulerRunResult } from '@/lib/achievement-scheduler'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import type { LabRole } from '@ultranos/shared-types'

/** Paths that bypass the authenticated shell (no sidebar). */
const PUBLIC_SUFFIXES = ['/login', '/offline']

export function AppShell({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const [pendingAchievements, setPendingAchievements] = useState<SchedulerRunResult | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  useAchievementScheduler((result) => setPendingAchievements(result))

  const isPublic = PUBLIC_SUFFIXES.some((suffix) => pathname?.endsWith(suffix))
  const showShell = isAuthenticated && !!session && !isPublic

  // Restore auth state from Supabase localStorage on page load/refresh.
  // After a hard navigation (window.location.href), Zustand resets to isAuthenticated=false
  // but Supabase still has the session in localStorage. This effect re-hydrates the store.
  useEffect(() => {
    if (isPublic || isAuthenticated) {
      setAuthChecked(true)
      return
    }

    let cancelled = false

    async function restoreSession() {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (cancelled) return

        if (!data.session) {
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/login?returnUrl=${returnUrl}`
          return
        }

        const user = data.session.user
        let sessionId = ''
        try {
          const jwt = data.session.access_token
          const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
          const payload = JSON.parse(atob(base64))
          sessionId = payload.session_id ?? ''
        } catch { /* malformed JWT */ }

        // Use cached lab role — AuthGuard on specific pages will refresh from Hub API
        const cached = (() => { try { return localStorage.getItem(`ultranos_lab_role_${user.id}`) } catch { return null } })()
        const labRole = (cached as LabRole) ?? ('LAB_TECH' as LabRole)

        useAuthSessionStore.getState().setSession({
          userId: user.id,
          practitionerId: user.user_metadata?.practitioner_id ?? user.id,
          role: 'LAB_TECH',
          sessionId,
          email: user.email ?? '',
          labRole,
        })
        // setSession sets isAuthenticated→true; effect re-runs with isAuthenticated=true,
        // which hits the early-return branch above and calls setAuthChecked(true)
      } catch {
        if (!cancelled) {
          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/login?returnUrl=${returnUrl}`
        }
      }
    }

    restoreSession()
    return () => { cancelled = true }
  }, [isAuthenticated, isPublic])

  if (!isPublic && !authChecked) {
    return (
      <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="Loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg border border-border bg-card p-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-5 w-48 rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (!showShell) {
    return <main id="main-content">{children}</main>
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PageHeader />
          <main className="flex flex-1 flex-col gap-4 p-4" id="main-content">
            {children}
          </main>
          <InstallPrompt />
        </SidebarInset>
      </SidebarProvider>
      <AchievementNotification
        result={pendingAchievements}
        onDismiss={() => setPendingAchievements(null)}
      />
    </TooltipProvider>
  )
}

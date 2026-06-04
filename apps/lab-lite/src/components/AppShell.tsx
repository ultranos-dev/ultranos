'use client'

import { useState, type ReactNode } from 'react'
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

/** Paths that bypass the authenticated shell (no sidebar). */
const PUBLIC_SUFFIXES = ['/login', '/offline']

export function AppShell({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const [pendingAchievements, setPendingAchievements] = useState<SchedulerRunResult | null>(null)
  useAchievementScheduler((result) => setPendingAchievements(result))

  const isPublic = PUBLIC_SUFFIXES.some((suffix) => pathname?.endsWith(suffix))
  const showShell = isAuthenticated && !!session && !isPublic

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

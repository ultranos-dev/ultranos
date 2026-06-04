'use client'

import * as React from 'react'
import { navGroups } from './nav-config'
import { PharmacyHeader } from './pharmacy-header'
import { NavMain } from './nav-main'
import { NavUser } from './nav-user'
import { SyncPulse } from '@/components/pharmacy/SyncPulse'
import { SyncCapacityBanner } from '@/components/pharmacy/SyncCapacityBanner'
import { SessionExpiryBanner } from '@/components/pharmacy/SessionExpiryBanner'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar'
import { useSyncStore } from '@/stores/sync-store'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useExpiryWatchdog } from '@/hooks/useExpiryWatchdog'

/**
 * Thin wrapper so LanguageSelectorClient can read sidebar collapse state
 * without the parent component needing to be aware of it.
 */
function SidebarLanguageSelector() {
  const { state } = useSidebar()
  return <LanguageSelectorClient collapsed={state === 'collapsed'} />
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const failedCount  = useSyncStore((s) => s.failedCount)

  const badges = {
    pending: pendingCount,
    failed:  failedCount,
  } as const

  useKeyboardShortcuts()
  useCatalogSync()
  useExpiryWatchdog()

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <PharmacyHeader />
      </SidebarHeader>

      <SidebarContent>
        <NavMain groups={navGroups} badges={badges} />
      </SidebarContent>

      <SidebarFooter>
        <SyncCapacityBanner />
        <SessionExpiryBanner />
        <SyncPulse />
        <SidebarLanguageSelector />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}

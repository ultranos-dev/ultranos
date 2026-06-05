'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useNavBadges } from '@/hooks/useNavBadges'
import { navGroups } from '@/components/sidebar/nav-config'
import { OpdHeader } from '@/components/sidebar/opd-header'
import { NavMain } from '@/components/sidebar/nav-main'
import { NavUser } from '@/components/sidebar/nav-user'
import { SyncPulse } from '@/components/SyncPulse'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from '@/components/ui/sidebar'

/**
 * Thin wrapper so LanguageSelectorClient can read sidebar collapse state
 * without the parent needing to be aware of it.
 */
function SidebarLanguageSelector() {
  const { state } = useSidebar()
  return <LanguageSelectorClient collapsed={state === 'collapsed'} />
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const badges = useNavBadges()

  // Don't render sidebar on login page or when unauthenticated
  if (!isAuthenticated || !session || pathname.endsWith('/login')) {
    return null
  }

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader>
        <OpdHeader />
      </SidebarHeader>

      <SidebarContent>
        <NavMain groups={navGroups} badges={badges} />
      </SidebarContent>

      <SidebarFooter>
        <SyncPulse />
        <SidebarLanguageSelector />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}

'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { useLocale } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useNavBadges } from '@/hooks/useNavBadges'
import { navGroups } from '@/components/sidebar/nav-config'
import { OpdHeader } from '@/components/sidebar/opd-header'
import { NavMain } from '@/components/sidebar/nav-main'
import { NavUser } from '@/components/sidebar/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar'

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const session = useAuthSessionStore((s) => s.session)
  const pathname = usePathname()
  const badges = useNavBadges()
  const locale = useLocale()
  const side = ['ar', 'prs', 'ps'].includes(locale) ? 'right' : 'left'

  // Don't render sidebar on login page or when unauthenticated
  if (!isAuthenticated || !session || pathname.endsWith('/login')) {
    return null
  }

  return (
    <Sidebar collapsible="icon" side={side} {...props}>
      <SidebarHeader>
        <OpdHeader />
      </SidebarHeader>

      <SidebarContent>
        <NavMain groups={navGroups} badges={badges} />
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}

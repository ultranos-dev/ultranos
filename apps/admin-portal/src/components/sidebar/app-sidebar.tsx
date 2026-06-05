'use client'

import * as React from 'react'
import { useLocale } from 'next-intl'
import { navGroups } from './nav-config'
import { LocationSwitcher } from './location-switcher'
import { NavMain } from './nav-main'
import { NavUser } from './nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const locale = useLocale()
  const side = (['ar', 'prs', 'ps'].includes(locale) ? 'right' : 'left') as 'left' | 'right'

  return (
    <Sidebar collapsible="icon" variant="inset" side={side} {...props}>
      <SidebarHeader>
        <LocationSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

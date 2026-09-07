'use client'

import * as React from 'react'
import { useLocale } from 'next-intl'
import { navGroups, filterNavGroups } from './nav-config'
import { PharmacyHeader } from './pharmacy-header'
import { NavMain } from './nav-main'
import { NavUser } from './nav-user'
import { SyncCapacityBanner } from '@/components/pharmacy/SyncCapacityBanner'
import { SessionExpiryBanner } from '@/components/pharmacy/SessionExpiryBanner'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { useSyncStore } from '@/stores/sync-store'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useCatalogSync } from '@/hooks/useCatalogSync'
import { useExpiryWatchdog } from '@/hooks/useExpiryWatchdog'
import { db } from '@/lib/db'

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const pendingCount = useSyncStore((s) => s.pendingCount)
  const failedCount  = useSyncStore((s) => s.failedCount)
  const locale = useLocale()
  const side = ['ar', 'prs', 'ps'].includes(locale) ? 'right' : 'left'

  const [enableWholesale, setEnableWholesale] = React.useState(false)

  React.useEffect(() => {
    db.pharmacySettings.toCollection().first().then((settings) => {
      setEnableWholesale(settings?.enableWholesale ?? false)
    }).catch(() => {
      setEnableWholesale(false)
    })
  }, [])

  const badges = {
    pending: pendingCount,
    failed:  failedCount,
  } as const

  useKeyboardShortcuts()
  useCatalogSync()
  useExpiryWatchdog()

  const visibleGroups = filterNavGroups(navGroups, { enableWholesale })

  return (
    <Sidebar collapsible="icon" side={side} {...props}>
      <SidebarHeader>
        <PharmacyHeader />
      </SidebarHeader>

      <SidebarContent>
        <NavMain groups={visibleGroups} badges={badges} />
      </SidebarContent>

      <SidebarFooter>
        <SyncCapacityBanner />
        <SessionExpiryBanner />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}

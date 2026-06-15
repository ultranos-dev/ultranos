'use client'

import { Pill } from '@ultranos/ui-kit/icons'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export function PharmacyHeader() {
  const pharmacyName = useAuthSessionStore(
    (s) =>
      (s.session as { pharmacyName?: string } | null)?.pharmacyName ??
      'Pharmacy Lite',
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="pointer-events-none select-none"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Pill className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">{pharmacyName}</span>
            <span className="truncate text-xs text-muted-foreground">
              Pharmacy
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

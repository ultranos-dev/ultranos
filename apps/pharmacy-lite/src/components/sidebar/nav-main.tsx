'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { type NavGroup } from './nav-config'
import { Collapsible } from 'radix-ui'
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

interface NavMainProps {
  groups: NavGroup[]
  badges?: Partial<Record<'pending' | 'failed', number>>
}

function findActiveGroup(groups: NavGroup[], pathname: string): string | null {
  return (
    groups.find((g) =>
      g.items.some((item) =>
        item.url === '/'
          ? pathname === '/' || pathname === ''
          : pathname === item.url || pathname.startsWith(`${item.url}/`),
      ),
    )?.title ?? null
  )
}

export function NavMain({ groups, badges = {} }: NavMainProps) {
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const { state: sidebarState } = useSidebar()

  const [openGroup, setOpenGroup] = useState<string | null>(() =>
    findActiveGroup(groups, pathname),
  )

  // Sync open group when navigating to a different section
  useEffect(() => {
    const active = findActiveGroup(groups, pathname)
    if (active) setOpenGroup(active)
  }, [pathname, groups])

  return (
    <>
      {groups.map((group) => {
        // Singleton group (Dashboard) — always visible, no collapsible
        if (group.items.length === 1) {
          const item = group.items[0]!
          const isActive =
            item.url === '/'
              ? pathname === '/' || pathname === ''
              : pathname === item.url || pathname.startsWith(`${item.url}/`)
          const badgeCount = item.badgeKey !== undefined ? (badges[item.badgeKey] ?? 0) : 0

          return (
            <SidebarGroup key={`singleton-${item.url}`}>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.titleKey)}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{t(item.titleKey)}</span>
                      {badgeCount > 0 && (
                        <span className="ms-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )
        }

        // In icon/collapsed mode all groups are forced open so item icons remain visible
        const isOpen = sidebarState === 'collapsed' || openGroup === group.title

        return (
          <Collapsible.Root
            key={group.title}
            open={isOpen}
            onOpenChange={(open) => {
              if (sidebarState !== 'collapsed') {
                setOpenGroup(open ? group.title : null)
              }
            }}
            className="group/collapsible"
          >
            <SidebarGroup>
              {/* Collapsible group header — icon + title + chevron */}
              <Collapsible.Trigger className="flex h-8 w-full cursor-pointer select-none items-center gap-1.5 rounded-xl border-0 bg-transparent px-3 text-xs font-medium text-sidebar-foreground/70 outline-hidden ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0 [&>svg]:size-4 [&>svg]:shrink-0">
                <group.icon />
                <span>{group.title}</span>
                <DirectionalIcon category="navigation">
                  <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </DirectionalIcon>
              </Collapsible.Trigger>

              <Collapsible.Content>
                <SidebarMenu>
                  {group.items.map((item) => {
                    // Parent-URL items only highlight on exact match so sibling
                    // child items (e.g. /inventory/receive) can highlight independently
                    const hasChildItem = group.items.some(
                      (other) =>
                        other.url !== item.url &&
                        other.url.startsWith(`${item.url}/`),
                    )
                    const isActive = hasChildItem
                      ? pathname === item.url
                      : pathname === item.url || pathname.startsWith(`${item.url}/`)
                    const badgeCount =
                      item.badgeKey !== undefined ? (badges[item.badgeKey] ?? 0) : 0

                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.titleKey)}>
                          <Link href={item.url}>
                            <item.icon />
                            <span>{t(item.titleKey)}</span>
                            {badgeCount > 0 && (
                              <span className="ms-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </Collapsible.Content>
            </SidebarGroup>
          </Collapsible.Root>
        )
      })}
    </>
  )
}

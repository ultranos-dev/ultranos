'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { type NavGroup, type NavBadgeKey } from './nav-config'
import { Collapsible } from 'radix-ui'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

interface NavMainProps {
  groups: NavGroup[]
  badges?: Partial<Record<NavBadgeKey, number>>
}

function findActiveItem(groups: NavGroup[], pathname: string): string | null {
  for (const group of groups) {
    for (const item of group.items) {
      if (!item.children?.length) continue
      const isActive =
        pathname === item.url ||
        item.children.some(
          (c) => pathname === c.url || pathname.startsWith(`${c.url}/`),
        )
      if (isActive) return item.url
    }
  }
  return null
}

export function NavMain({ groups, badges = {} }: NavMainProps) {
  const pathname = usePathname()
  const t = useTranslations('sidebar')

  const [openItem, setOpenItem] = useState<string | null>(() =>
    findActiveItem(groups, pathname),
  )

  useEffect(() => {
    const active = findActiveItem(groups, pathname)
    if (active) setOpenItem(active)
  }, [pathname, groups])

  return (
    <>
      {groups.map((group) => {
        // Singleton group (Dashboard, Admin, System) — no label, no collapsible
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

        // Multi-item group — always-visible label + item-level collapsible for parents with children
        return (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  item.url === '/'
                    ? pathname === '/' || pathname === ''
                    : pathname === item.url || pathname.startsWith(`${item.url}/`)
                const badgeCount = item.badgeKey !== undefined ? (badges[item.badgeKey] ?? 0) : 0

                // Item with explicit children → collapsible parent
                if (item.children && item.children.length > 0) {
                  return (
                    <Collapsible.Root
                      key={item.url}
                      asChild
                      open={openItem === item.url}
                      onOpenChange={(open) => setOpenItem(open ? item.url : null)}
                    >
                      <SidebarMenuItem>
                        <Collapsible.Trigger asChild>
                          <SidebarMenuButton
                            tooltip={t(item.titleKey)}
                            isActive={pathname === item.url}
                          >
                            <item.icon />
                            <span>{t(item.titleKey)}</span>
                            <DirectionalIcon category="navigation">
                              <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </DirectionalIcon>
                          </SidebarMenuButton>
                        </Collapsible.Trigger>
                        <Collapsible.Content>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                                <Link href={item.url}>Overview</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            {item.children.map((child) => {
                              const childBadge =
                                child.badgeKey !== undefined ? (badges[child.badgeKey] ?? 0) : 0
                              return (
                                <SidebarMenuSubItem key={child.url}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={
                                      pathname === child.url ||
                                      pathname.startsWith(`${child.url}/`)
                                    }
                                  >
                                    <Link href={child.url}>
                                      {t(child.titleKey)}
                                      {childBadge > 0 && (
                                        <span className="ms-auto flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                                          {childBadge > 99 ? '99+' : childBadge}
                                        </span>
                                      )}
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        </Collapsible.Content>
                      </SidebarMenuItem>
                    </Collapsible.Root>
                  )
                }

                // Standalone item
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
          </SidebarGroup>
        )
      })}
    </>
  )
}

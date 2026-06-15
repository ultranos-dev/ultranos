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
  badges?: Partial<Record<'pending' | 'failed', number>>
}

function findActiveItem(groups: NavGroup[], pathname: string): string | null {
  for (const group of groups) {
    for (const item of group.items.filter((i) => i.icon)) {
      const subItems = group.items.filter(
        (sub) => !sub.icon && sub.url.startsWith(`${item.url}/`),
      )
      if (subItems.length > 0) {
        if (pathname === item.url || pathname.startsWith(`${item.url}/`)) {
          return item.url
        }
      }
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
        // Singleton group (Dashboard) — no label, no collapsible
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
                      {item.icon && <item.icon />}
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

        // Multi-item group — always-visible label + item-level collapsible for parents with sub-items.
        // Convention: items WITH icon = parent or standalone; items WITHOUT icon = sub-items of nearest
        // preceding parent (detected by URL prefix match: sub.url.startsWith(parent.url + '/')).
        return (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items
                .filter((item) => item.icon)
                .map((item) => {
                  const Icon = item.icon!
                  const subItems = group.items.filter(
                    (sub) => !sub.icon && sub.url.startsWith(`${item.url}/`),
                  )
                  // Exact-match active only when the item has sub-items (so sub-items can highlight independently)
                  const hasChildren = subItems.length > 0
                  const isActive = hasChildren
                    ? pathname === item.url
                    : pathname === item.url || pathname.startsWith(`${item.url}/`)
                  const badgeCount = item.badgeKey !== undefined ? (badges[item.badgeKey] ?? 0) : 0

                  if (!hasChildren) {
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={t(item.titleKey)}>
                          <Link href={item.url}>
                            <Icon />
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
                  }

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
                            <Icon />
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
                            {subItems.map((sub) => (
                              <SidebarMenuSubItem key={sub.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={
                                    pathname === sub.url ||
                                    pathname.startsWith(`${sub.url}/`)
                                  }
                                >
                                  <Link href={sub.url}>{t(sub.titleKey)}</Link>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </Collapsible.Content>
                      </SidebarMenuItem>
                    </Collapsible.Root>
                  )
                })}
            </SidebarMenu>
          </SidebarGroup>
        )
      })}
    </>
  )
}

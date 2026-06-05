'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight } from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { Collapsible } from 'radix-ui'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'
import type { LabNavGroup } from './nav-config'

interface NavLabProps {
  groups: LabNavGroup[]
}

export function NavLab({ groups }: NavLabProps) {
  const pathname = usePathname()
  const tCommon = useTranslations('common')

  return (
    <>
      {groups.map((group) => {
        if (group.items.length === 0) return null

        // Single-item group (Dashboard) — no label, no collapsible
        if (group.items.length === 1) {
          const item = group.items[0]!
          const Icon = item.icon
          const isActive = pathname === item.url || pathname?.startsWith(`${item.url}/`)

          return (
            <SidebarGroup key={`singleton-${item.url}`}>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                    <Link href={item.url}>
                      {Icon && <Icon />}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge != null && item.badge > 0 && (
                    <SidebarMenuBadge>
                      {item.badge > 99 ? '99+' : item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )
        }

        // Multi-item group — parent items have icons, sub-items do not
        return (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items
                .filter((item) => item.icon)
                .map((item) => {
                  const Icon = item.icon!
                  const isActive =
                    pathname === item.url || pathname?.startsWith(`${item.url}/`)
                  const subItems = group.items.filter(
                    (sub) => !sub.icon && sub.url.startsWith(`${item.url}/`),
                  )

                  if (subItems.length === 0) {
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <Link href={item.url}>
                            <Icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge != null && item.badge > 0 && (
                          <SidebarMenuBadge>
                            {item.badge > 99 ? '99+' : item.badge}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    )
                  }

                  return (
                    <Collapsible.Root
                      key={item.url}
                      asChild
                      defaultOpen={isActive || subItems.some((s) => pathname === s.url)}
                    >
                      <SidebarMenuItem>
                        <Collapsible.Trigger asChild>
                          <SidebarMenuButton tooltip={item.title} isActive={isActive}>
                            <Icon />
                            <span>{item.title}</span>
                            <DirectionalIcon category="navigation">
                              <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </DirectionalIcon>
                          </SidebarMenuButton>
                        </Collapsible.Trigger>
                        <Collapsible.Content>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild isActive={pathname === item.url}>
                                <Link href={item.url}>{tCommon('overview')}</Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            {subItems.map((sub) => (
                              <SidebarMenuSubItem key={sub.url}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === sub.url}
                                >
                                  <Link href={sub.url}>{sub.title}</Link>
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

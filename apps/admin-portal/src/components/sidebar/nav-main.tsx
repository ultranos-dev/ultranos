'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
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
}

export function NavMain({ groups }: NavMainProps) {
  const pathname = usePathname()

  return (
    <>
      {groups.map((group) => {
        // Single-item groups (Overview, System) render without collapsible
        if (group.items.length === 1) {
          const item = group.items[0]!
          const Icon = item.icon ?? group.icon
          const isActive = pathname === item.url || pathname?.startsWith(`${item.url}/`)

          return (
            <SidebarGroup key={group.title}>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                    <Link href={item.url}>
                      <Icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          )
        }

        return (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items
                .filter((item) => item.icon)
                .map((item) => {
                  const isActive = pathname === item.url || pathname?.startsWith(`${item.url}/`)
                  const subItems = group.items.filter(
                    (sub) => !sub.icon && sub.url.startsWith(item.url + '/')
                  )

                  if (subItems.length === 0) {
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                          <Link href={item.url}>
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
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
                          <SidebarMenuButton tooltip={item.title} isActive={pathname === item.url}>
                            {item.icon && <item.icon />}
                            <span>{item.title}</span>
                            <DirectionalIcon category="navigation">
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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
                                <SidebarMenuSubButton asChild isActive={pathname === sub.url}>
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

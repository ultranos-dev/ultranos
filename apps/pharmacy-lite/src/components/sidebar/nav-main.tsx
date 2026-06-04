'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { type NavGroup } from './nav-config'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

interface NavMainProps {
  groups: NavGroup[]
  /**
   * Runtime badge counts keyed by badgeKey ('pending' | 'failed').
   * Non-zero values render a small numeric badge beside the nav item label.
   */
  badges?: Partial<Record<'pending' | 'failed', number>>
}

export function NavMain({ groups, badges = {} }: NavMainProps) {
  const pathname = usePathname()
  const t = useTranslations('sidebar')

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => {
              const isActive =
                item.url === '/'
                  ? pathname === '/' || pathname === ''
                  : pathname === item.url ||
                    pathname.startsWith(`${item.url}/`)

              const badgeCount =
                item.badgeKey !== undefined
                  ? (badges[item.badgeKey] ?? 0)
                  : 0

              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    tooltip={t(item.titleKey)}
                  >
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
      ))}
    </>
  )
}

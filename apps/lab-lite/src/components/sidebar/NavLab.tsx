'use client'

import Link from 'next/link'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { SidebarNavItem } from '@ultranos/ui-kit'

const GROUP_LABELS: Record<string, string> = {
  primary: '',
  clinical: 'Clinical',
  finance: 'Finance',
  system: 'System',
}

const GROUP_ORDER = ['primary', 'clinical', 'finance', 'system'] as const

interface NavLabProps {
  items: SidebarNavItem[]
}

export function NavLab({ items }: NavLabProps) {
  const grouped = GROUP_ORDER.reduce<Record<string, SidebarNavItem[]>>(
    (acc, key) => ({ ...acc, [key]: [] }),
    {}
  )
  for (const item of items) {
    const g = (item.group ?? 'primary') as string
    if (g in grouped) grouped[g]!.push(item)
  }

  return (
    <>
      {GROUP_ORDER.map((groupKey) => {
        const groupItems = grouped[groupKey] ?? []
        if (groupItems.length === 0) return null
        const label = GROUP_LABELS[groupKey]

        return (
          <SidebarGroup key={groupKey}>
            {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
            <SidebarMenu>
              {groupItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={item.active} tooltip={item.label}>
                    <Link href={item.href}>
                      <span className="flex size-5 shrink-0 items-center justify-center">
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge != null && item.badge > 0 && (
                    <SidebarMenuBadge>
                      {item.badge > 99 ? '99+' : item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )
      })}
    </>
  )
}

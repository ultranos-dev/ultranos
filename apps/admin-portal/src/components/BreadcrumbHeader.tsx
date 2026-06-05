'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { buildBreadcrumbs } from '@/lib/route-map'
import React from 'react'
import { Badge } from '@/components/ui/badge'
import { useLocationStore, ALL_LOCATIONS } from '@/stores/location-store'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

export function BreadcrumbHeader() {
  const pathname = usePathname()
  const crumbs = buildBreadcrumbs(pathname ?? '/dashboard')
  const selected = useLocationStore((s) => s.selected)
  const isFiltered = selected.id !== ALL_LOCATIONS.id

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => (
            <React.Fragment key={crumb.href}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ms-auto flex items-center gap-2">
        {isFiltered && (
          <Badge variant="outline" className="text-xs">
            {selected.name}
          </Badge>
        )}
        <LanguageSelectorClient />
      </div>
    </header>
  )
}

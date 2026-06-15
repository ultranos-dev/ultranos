'use client'

import * as React from 'react'
import { usePathname } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { buildBreadcrumbs } from '@/lib/route-map'
import { SyncPulse } from '@/components/pharmacy/SyncPulse'
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

export function BreadcrumbHeader() {
  const pathname = usePathname()
  const crumbs = buildBreadcrumbs(pathname ?? '/')

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ms-1" />
      <Separator orientation="vertical" className="me-2 h-4" />
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
        <DataBudgetIndicator />
        <SyncPulse />
        <LanguageSelectorClient />
      </div>
    </header>
  )
}

'use client'

import Link from 'next/link'
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
import { SyncPulse } from '@/components/SyncPulse'
import { DataBudgetIndicator } from '@/components/DataBudgetIndicator'
import { LanguageSelectorClient } from '@/components/LanguageSelectorClient'

export function PageHeader() {
  const pathname = usePathname()
  const crumbs = buildBreadcrumbs(pathname ?? '/')

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, index) => (
            <BreadcrumbItem key={crumb.href}>
              {index < crumbs.length - 1 ? (
                <>
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
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

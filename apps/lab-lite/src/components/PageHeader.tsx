'use client'

import { usePathname } from 'next/navigation'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { buildBreadcrumbs } from '@/lib/route-map'

export function PageHeader() {
  const pathname = usePathname()
  const crumbs = buildBreadcrumbs(pathname ?? '/')

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb) => (
            <BreadcrumbItem key={crumb.href}>
              <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
            </BreadcrumbItem>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}

'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { CatalogBrowsePage } from '@/components/pharmacy/inventory/CatalogBrowsePage'

export default function CatalogRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Catalog' },
        ]}
      />
      <CatalogBrowsePage />
    </>
  )
}

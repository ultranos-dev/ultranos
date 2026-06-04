'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { StockCountPage } from '@/components/pharmacy/procurement/StockCountPage'

export default function StockCountRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Stock Count' },
        ]}
      />
      <StockCountPage />
    </>
  )
}

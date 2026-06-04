'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { ReceiveStockPage } from '@/components/pharmacy/inventory/ReceiveStockPage'

export default function ReceiveStockRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Receive Stock' },
        ]}
      />
      <ReceiveStockPage />
    </>
  )
}

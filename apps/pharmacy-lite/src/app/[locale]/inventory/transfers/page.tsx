'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { TransfersPage } from '@/components/pharmacy/transfers/TransfersPage'

export default function TransfersRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Transfers' },
        ]}
      />
      <TransfersPage />
    </>
  )
}

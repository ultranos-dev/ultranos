'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { CashDrawerPage } from '@/components/pharmacy/pos/CashDrawerPage'

export default function CashDrawerRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Point of Sale', href: '/pos' },
          { label: 'Cash Drawer' },
        ]}
      />
      <CashDrawerPage />
    </>
  )
}

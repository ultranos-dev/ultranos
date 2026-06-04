'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { SuppliersPage } from '@/components/pharmacy/procurement/SuppliersPage'

export default function SuppliersRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Suppliers' },
        ]}
      />
      <SuppliersPage />
    </>
  )
}

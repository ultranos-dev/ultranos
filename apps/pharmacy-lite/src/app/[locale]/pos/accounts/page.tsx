'use client'

import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { PatientAccountsPage } from '@/components/pharmacy/pos/PatientAccountsPage'

export default function PatientAccountsRoute() {
  return (
    <>
      <BreadcrumbHeader
        crumbs={[
          { label: 'Point of Sale', href: '/pos' },
          { label: 'Patient Accounts' },
        ]}
      />
      <PatientAccountsPage />
    </>
  )
}

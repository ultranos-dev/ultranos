'use client'

import { TopHeader } from '@/components/TopHeader'
import { ReportsPage } from '@/components/pharmacy/reports/ReportsPage'

export default function ReportsRoute() {
  return (
    <>
      <TopHeader title="Reports" />
      <ReportsPage />
    </>
  )
}

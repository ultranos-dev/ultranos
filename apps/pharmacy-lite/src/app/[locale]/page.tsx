'use client'

import { TopHeader } from '@/components/TopHeader'
import { PharmacyDashboard } from '@/components/pharmacy/PharmacyDashboard'

export default function PharmacyHomePage() {
  return (
    <>
      <TopHeader title="Dashboard" />
      <PharmacyDashboard />
    </>
  )
}

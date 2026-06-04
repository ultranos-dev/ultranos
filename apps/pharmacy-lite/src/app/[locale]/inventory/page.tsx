'use client'

import { TopHeader } from '@/components/TopHeader'
import { StockOverviewPage } from '@/components/pharmacy/inventory/StockOverviewPage'

export default function InventoryRoute() {
  return (
    <>
      <TopHeader title="Inventory" />
      <StockOverviewPage />
    </>
  )
}

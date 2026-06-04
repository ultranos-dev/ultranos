'use client'

import { TopHeader } from '@/components/TopHeader'
import { PosPage } from '@/components/pharmacy/pos/PosPage'

export default function PosRoute() {
  return (
    <>
      <TopHeader title="Point of Sale" />
      <PosPage />
    </>
  )
}

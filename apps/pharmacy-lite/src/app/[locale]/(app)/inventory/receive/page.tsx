'use client'

import { useSearchParams } from 'next/navigation'
import { ReceiveStockPage } from '@/components/pharmacy/inventory/ReceiveStockPage'

export default function ReceiveStockRoute() {
  const poId = useSearchParams().get('poId') ?? undefined
  return <ReceiveStockPage purchaseOrderId={poId} />
}

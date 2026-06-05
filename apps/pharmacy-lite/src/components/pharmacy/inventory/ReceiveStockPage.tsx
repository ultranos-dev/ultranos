'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ReceiveStockForm } from './ReceiveStockForm'

export function ReceiveStockPage() {
  const router = useRouter()
  const [showSuccess, setShowSuccess] = useState(false)
  const locationId = 'default'
  const currencyMinorUnits = 2

  if (showSuccess) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-success bg-success/5 p-6 text-center" data-testid="receipt-success">
          <p className="text-lg font-bold text-success">Stock Received Successfully</p>
          <p className="text-sm text-success mt-1">Items have been added to your inventory.</p>
          <div className="mt-4 flex gap-3 justify-center">
            <button type="button" onClick={() => setShowSuccess(false)} className="text-sm font-semibold text-primary-700 hover:text-primary-800">Receive More</button>
            <button type="button" onClick={() => router.push('/inventory')} className="text-sm font-semibold text-muted-foreground hover:text-foreground">View Stock</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">Receive Stock</h1>
      <p className="text-sm text-muted-foreground">Search or scan products to record incoming stock.</p>
      <ReceiveStockForm locationId={locationId} currencyMinorUnits={currencyMinorUnits} onComplete={() => setShowSuccess(true)} />
    </div>
  )
}

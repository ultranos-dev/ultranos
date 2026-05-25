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
        <div className="rounded-lg border-2 border-green-400 bg-green-50 p-6 text-center" data-testid="receipt-success">
          <p className="text-lg font-bold text-green-800">Stock Received Successfully</p>
          <p className="text-sm text-green-700 mt-1">Items have been added to your inventory.</p>
          <div className="mt-4 flex gap-3 justify-center">
            <button type="button" onClick={() => setShowSuccess(false)} className="text-sm font-semibold text-primary-700 hover:text-primary-800">Receive More</button>
            <button type="button" onClick={() => router.push('/inventory')} className="text-sm font-semibold text-neutral-600 hover:text-neutral-800">View Stock</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-neutral-900">Receive Stock</h1>
      <p className="text-sm text-neutral-500">Search or scan products to record incoming stock.</p>
      <ReceiveStockForm locationId={locationId} currencyMinorUnits={currencyMinorUnits} onComplete={() => setShowSuccess(true)} />
    </div>
  )
}

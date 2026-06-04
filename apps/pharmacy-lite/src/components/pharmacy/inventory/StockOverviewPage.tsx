'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useStockAlerts } from '@/hooks/useStockAlerts'
import { StockAlertPanel } from './StockAlertPanel'
import { StockTable } from './StockTable'

type ActiveFilter = 'all' | 'low-stock' | 'near-expiry' | 'quarantined'

const filterLabels: Record<ActiveFilter, string> = {
  all: 'All',
  'low-stock': 'Low Stock',
  'near-expiry': 'Near Expiry',
  quarantined: 'Quarantined',
}

export function StockOverviewPage() {
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  useStockAlerts()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Stock Overview</h1>
        <Link href="/inventory/receive">
          <Button variant="default">Receive Stock</Button>
        </Link>
      </div>

      {/* Alert cards */}
      <StockAlertPanel
        onFilterLowStock={() => setActiveFilter('low-stock')}
        onFilterNearExpiry={() => setActiveFilter('near-expiry')}
        onFilterQuarantined={() => setActiveFilter('quarantined')}
      />

      {/* Active filter pill */}
      {activeFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
            {filterLabels[activeFilter]}
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="ms-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label="Clear filter"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Stock table */}
      <StockTable
        filterStatus={activeFilter === 'quarantined' ? 'quarantined' : 'all'}
        filterLowStock={activeFilter === 'low-stock'}
        filterNearExpiry={activeFilter === 'near-expiry'}
      />
    </div>
  )
}

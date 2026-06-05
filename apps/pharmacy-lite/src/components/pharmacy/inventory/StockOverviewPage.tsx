'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { useStockAlerts } from '@/hooks/useStockAlerts'
import { StockAlertPanel } from './StockAlertPanel'
import { StockTable } from './StockTable'

type ActiveFilter = 'all' | 'low-stock' | 'near-expiry' | 'quarantined'

export function StockOverviewPage() {
  const t = useTranslations('inventory')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  useStockAlerts()

  const filterLabels: Record<ActiveFilter, string> = {
    all: t('filterAll' as never) ?? 'All',
    'low-stock': t('lowStock'),
    'near-expiry': t('nearExpiry'),
    quarantined: t('quarantined'),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t('stockOverview')}</h1>
        <Link href="/inventory/receive">
          <Button variant="default">{t('receiveStock')}</Button>
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
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
            {filterLabels[activeFilter]}
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="ms-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label={t('clearFilter')}
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

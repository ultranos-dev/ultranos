'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { useStockAlerts } from '@/hooks/useStockAlerts'
import { StockAlertPanel } from './StockAlertPanel'
import { StockTable } from './StockTable'
import { getInventoryValuation } from '@/lib/inventory/valuation'
import { db } from '@/lib/db'

type ActiveFilter = 'all' | 'low-stock' | 'near-expiry' | 'quarantined'

function formatAmount(amount: number, currency: string, minorUnits: number): string {
  const divisor = Math.pow(10, minorUnits)
  return `${currency} ${(amount / divisor).toFixed(minorUnits)}`
}

export function StockOverviewPage() {
  const t = useTranslations('inventory')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [search, setSearch] = useState('')
  const [totalValue, setTotalValue] = useState<number | null>(null)
  const [currency, setCurrency] = useState('AFN')
  const [currencyMinorUnits, setCurrencyMinorUnits] = useState(2)
  useStockAlerts()

  const loadValuation = useCallback(async () => {
    const [valuation, settings] = await Promise.all([
      getInventoryValuation(),
      db.pharmacySettings.toCollection().first(),
    ])
    setTotalValue(valuation.totalValue)
    if (settings) {
      setCurrency(settings.currency)
      setCurrencyMinorUnits(settings.currencyMinorUnits)
    }
  }, [])

  useEffect(() => {
    void loadValuation()
  }, [loadValuation])

  const filterLabels: Record<ActiveFilter, string> = {
    all: t('filterAll' as never) ?? 'All',
    'low-stock': t('lowStock'),
    'near-expiry': t('nearExpiry'),
    quarantined: t('quarantined'),
  }

  const filtersActive = search.trim() !== '' || activeFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setActiveFilter('all')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('stockOverview')}</h1>

      {/* Inventory-valuation summary — shown once value is loaded */}
      {totalValue !== null && (
        <div
          data-testid="inventory-valuation"
          className="flex items-center gap-2 rounded-xl bg-card px-4 py-3 text-sm shadow-card ring-[0.65px] ring-border/50"
        >
          <span className="font-medium text-muted-foreground">{t('inventoryValuation')}:</span>
          <span className="font-semibold text-foreground">
            {formatAmount(totalValue, currency, currencyMinorUnits)}
          </span>
        </div>
      )}

      {/* Alert cards — stat/alert row directly after the h1 */}
      <StockAlertPanel
        onFilterLowStock={() => setActiveFilter('low-stock')}
        onFilterNearExpiry={() => setActiveFilter('near-expiry')}
        onFilterQuarantined={() => setActiveFilter('quarantined')}
      />

      {/* Toolbar: search + active-filter pills + Receive Stock — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchByProduct')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchByProduct')}
        />
        <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['all', 'low-stock', 'near-expiry', 'quarantined'] as ActiveFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={activeFilter === f}
              onClick={() => setActiveFilter(f)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                activeFilter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>
        <Button asChild variant="default" className="h-9">
          <Link href="/inventory/receive">{t('receiveStock')}</Link>
        </Button>
      </div>

      {/* Stock table — single cohesive box */}
      <StockTable
        filterStatus={activeFilter === 'quarantined' ? 'quarantined' : 'all'}
        filterLowStock={activeFilter === 'low-stock'}
        filterNearExpiry={activeFilter === 'near-expiry'}
        search={search}
        filtersActive={filtersActive}
        onClearFilters={clearFilters}
      />
    </div>
  )
}

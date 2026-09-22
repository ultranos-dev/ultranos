'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { ClipboardList, FileSearch, RefreshCw, AlertTriangle } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import type { LabOrderEntry } from '@/lib/db'
import { OrderCard } from './OrderCard'
import { OrderFilters, type OrderFilterValues } from './OrderFilters'

const URGENCY_RANK: Record<string, number> = {
  stat: 0,
  asap: 1,
  urgent: 2,
  routine: 3,
}

interface OrdersWorklistProps {
  orders: LabOrderEntry[]
  loading: boolean
  /** Non-null when the Hub is unreachable AND the local cache is empty. */
  error?: string | null
  onRefresh?: () => void
}

export function OrdersWorklist({ orders, loading, error, onRefresh }: OrdersWorklistProps) {
  const t = useTranslations('orders')
  const [filters, setFilters] = useState<OrderFilterValues>({
    status: 'ALL',
    urgency: 'ALL',
  })
  const [search, setSearch] = useState('')

  const query = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    let result = orders

    if (filters.status !== 'ALL') {
      result = result.filter((o) => o.status === filters.status)
    }
    if (filters.urgency !== 'ALL') {
      result = result.filter((o) => o.urgency === filters.urgency)
    }
    if (query) {
      result = result.filter((o) => (o.orderId ?? '').toLowerCase().includes(query))
    }

    // Sort: urgency DESC (STAT first), then authoredOn ASC (oldest first)
    return result.slice().sort((a, b) => {
      const urgDiff =
        (URGENCY_RANK[a.urgency] ?? 3) - (URGENCY_RANK[b.urgency] ?? 3)
      if (urgDiff !== 0) return urgDiff
      return new Date(a.authoredOn).getTime() - new Date(b.authoredOn).getTime()
    })
  }, [orders, filters, query])

  const filtersActive = filters.status !== 'ALL' || filters.urgency !== 'ALL' || query !== ''
  const clearFilters = () => {
    setFilters({ status: 'ALL', urgency: 'ALL' })
    setSearch('')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: search + filters + refresh — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          inputClassName="h-9 rounded-full"
          aria-label={t('searchPlaceholder')}
        />
        <OrderFilters value={filters} onChange={setFilters} />
        {onRefresh && (
          <Button variant="secondary" onClick={onRefresh} aria-label={t('refresh')}>
            <RefreshCw className="size-4" />
            {t('refresh')}
          </Button>
        )}
      </div>

      {/* Content box — single cohesive box (loading / error / empty / list) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {/* State 1: loading */}
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
            {t('loading')}
          </div>
        ) : /* State 2: error with no data to show — never show a false genuine-empty */
        error && orders.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={AlertTriangle}
              title={t('unavailableTitle')}
              description={t('unavailableDescription')}
              action={onRefresh ? { label: t('retry'), onClick: onRefresh } : undefined}
            />
          </div>
        ) : /* State 3: genuine empty (loaded successfully, zero orders after filters) */
        filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : ClipboardList}
              title={filtersActive ? t('noResultsTitle') : t('emptyState')}
              description={filtersActive ? t('noResultsDescription') : undefined}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
          /* State 4: data */
          <div className="flex flex-col gap-3 p-3">
            {filtered.map((order) => (
              <OrderCard key={order.orderId} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

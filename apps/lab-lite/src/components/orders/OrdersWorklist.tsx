'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { ClipboardList, FileSearch, RefreshCw } from '@ultranos/ui-kit/icons'
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
  onRefresh?: () => void
}

export function OrdersWorklist({ orders, loading, onRefresh }: OrdersWorklistProps) {
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

      {/* Content box — single cohesive box (loading / empty / list) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground" aria-busy="true">
            {t('loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : ClipboardList}
              title={filtersActive ? t('noResultsTitle') : t('emptyState')}
              description={filtersActive ? t('noResultsDescription') : undefined}
              action={filtersActive ? { label: t('clearFilters'), onClick: clearFilters } : undefined}
            />
          </div>
        ) : (
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

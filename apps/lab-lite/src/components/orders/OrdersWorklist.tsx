'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
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
}

export function OrdersWorklist({ orders, loading }: OrdersWorklistProps) {
  const t = useTranslations('orders')
  const [filters, setFilters] = useState<OrderFilterValues>({
    status: 'ALL',
    urgency: 'ALL',
  })

  const filtered = useMemo(() => {
    let result = orders

    if (filters.status !== 'ALL') {
      result = result.filter((o) => o.status === filters.status)
    }
    if (filters.urgency !== 'ALL') {
      result = result.filter((o) => o.urgency === filters.urgency)
    }

    // Sort: urgency DESC (STAT first), then authoredOn ASC (oldest first)
    return result.slice().sort((a, b) => {
      const urgDiff =
        (URGENCY_RANK[a.urgency] ?? 3) - (URGENCY_RANK[b.urgency] ?? 3)
      if (urgDiff !== 0) return urgDiff
      return new Date(a.authoredOn).getTime() - new Date(b.authoredOn).getTime()
    })
  }, [orders, filters])

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
            aria-busy="true"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <OrderFilters value={filters} onChange={setFilters} />

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-gray-500 dark:text-gray-400">
          {t('emptyState')}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((order) => (
            <OrderCard key={order.orderId} order={order} />
          ))}
        </div>
      )}
    </div>
  )
}

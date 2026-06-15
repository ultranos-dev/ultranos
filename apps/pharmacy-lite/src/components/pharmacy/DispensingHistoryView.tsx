'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { getHistoryPage, type HistoryFilters, type HistoryPage } from '@/lib/history-data'
import { HistoryFilterBar } from './HistoryFilterBar'
import { HistoryItemRow } from './HistoryItemRow'
import { Pagination } from './Pagination'
import { ShiftSummary } from './ShiftSummary'

export function DispensingHistoryView() {
  const t = useTranslations('history')
  const [filters, setFilters] = useState<HistoryFilters>({})
  const [page, setPage] = useState(1)
  const [data, setData] = useState<HistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showShiftSummary, setShowShiftSummary] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getHistoryPage(filters, page)
      setData(result)
    } catch {
      setError(t('loadError'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleFiltersChange = (newFilters: HistoryFilters) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page on filter change
  }

  return (
    <div data-testid="dispensing-history-view" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <HistoryFilterBar filters={filters} onFiltersChange={handleFiltersChange} />
        <Button
          variant="secondary"
          data-testid="shift-summary-button"
          onClick={() => setShowShiftSummary(true)}
        >
          {t('shiftSummaryButton')}
        </Button>
      </div>

      {loading ? (
        <div data-testid="history-loading" className="py-8 text-center text-sm text-muted-foreground">
          {t('loading')}
        </div>
      ) : error ? (
        <div data-testid="history-error" className="py-8 text-center text-sm text-destructive">
          {error}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="text-xs text-muted-foreground">
            {t('recordsFound', { count: data.totalCount })}
          </div>
          <ul
            data-testid="history-list"
            className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden"
          >
            {data.items.map((item) => (
              <HistoryItemRow key={item.id} item={item} />
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
        </>
      ) : (
        <EmptyState title={t('noRecords')} data-testid="history-empty" />
      )}

      {showShiftSummary && (
        <ShiftSummary onClose={() => setShowShiftSummary(false)} />
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getHistoryPage, type HistoryFilters, type HistoryPage } from '@/lib/history-data'
import { HistoryFilterBar } from './HistoryFilterBar'
import { HistoryItemRow } from './HistoryItemRow'
import { Pagination } from './Pagination'
import { ShiftSummary } from './ShiftSummary'

export function DispensingHistoryView() {
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
      setError('Failed to load dispensing history. Please retry.')
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleFiltersChange = (newFilters: HistoryFilters) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page on filter change
  }

  return (
    <div data-testid="dispensing-history-view" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <HistoryFilterBar filters={filters} onFiltersChange={handleFiltersChange} />
        <Button
          variant="secondary"
          data-testid="shift-summary-button"
          onClick={() => setShowShiftSummary(true)}
        >
          Shift Summary
        </Button>
      </div>

      {loading ? (
        <div data-testid="history-loading" className="py-8 text-center text-sm text-neutral-400">
          Loading...
        </div>
      ) : error ? (
        <div data-testid="history-error" className="py-8 text-center text-sm text-red-600">
          {error}
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="text-xs text-neutral-500">
            {data.totalCount} record{data.totalCount !== 1 ? 's' : ''} found
          </div>
          <ul
            data-testid="history-list"
            className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white overflow-hidden"
          >
            {data.items.map((item) => (
              <HistoryItemRow key={item.id} item={item} />
            ))}
          </ul>
          <Pagination page={data.page} totalPages={data.totalPages} onPageChange={setPage} />
        </>
      ) : (
        <div data-testid="history-empty" className="py-8 text-center text-sm text-neutral-400">
          No dispensing records found
        </div>
      )}

      {showShiftSummary && (
        <ShiftSummary onClose={() => setShowShiftSummary(false)} />
      )}
    </div>
  )
}

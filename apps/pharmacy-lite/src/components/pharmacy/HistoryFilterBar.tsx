'use client'

import type { HistoryFilters, SyncStatus } from '@/lib/history-data'

interface HistoryFilterBarProps {
  filters: HistoryFilters
  onFiltersChange: (filters: HistoryFilters) => void
}

export function HistoryFilterBar({ filters, onFiltersChange }: HistoryFilterBarProps) {
  const update = (patch: Partial<HistoryFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  return (
    <div
      data-testid="history-filter-bar"
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-from" className="text-xs font-medium text-muted-foreground">
          From
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => update({ dateFrom: e.target.value || undefined })}
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-to" className="text-xs font-medium text-muted-foreground">
          To
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => update({ dateTo: e.target.value || undefined })}
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-medication" className="text-xs font-medium text-muted-foreground">
          Medication
        </label>
        <input
          id="filter-medication"
          type="text"
          placeholder="Search medication..."
          value={filters.medicationName ?? ''}
          onChange={(e) => update({ medicationName: e.target.value || undefined })}
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-sync-status" className="text-xs font-medium text-muted-foreground">
          Sync Status
        </label>
        <select
          id="filter-sync-status"
          value={filters.syncStatus ?? ''}
          onChange={(e) =>
            update({ syncStatus: (e.target.value || undefined) as SyncStatus | undefined })
          }
          className="rounded-md border border-border px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="">All</option>
          <option value="synced">Synced</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>
    </div>
  )
}

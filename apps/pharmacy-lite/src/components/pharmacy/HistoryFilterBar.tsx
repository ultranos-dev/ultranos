'use client'

import { useTranslations } from 'next-intl'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import type { HistoryFilters, SyncStatus } from '@/lib/history-data'

interface HistoryFilterBarProps {
  filters: HistoryFilters
  onFiltersChange: (filters: HistoryFilters) => void
}

export function HistoryFilterBar({ filters, onFiltersChange }: HistoryFilterBarProps) {
  const t = useTranslations('history')
  const update = (patch: Partial<HistoryFilters>) => {
    onFiltersChange({ ...filters, ...patch })
  }

  // `contents` lets these controls participate directly in the parent toolbar's
  // flex row (single Notifications-style row: date filters -> wide search -> select).
  return (
    <div data-testid="history-filter-bar" className="contents">
      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-from" className="text-xs font-medium text-muted-foreground">
          {t('filterFrom')}
        </label>
        <input
          id="filter-date-from"
          type="date"
          value={filters.dateFrom ?? ''}
          onChange={(e) => update({ dateFrom: e.target.value || undefined })}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="filter-date-to" className="text-xs font-medium text-muted-foreground">
          {t('filterTo')}
        </label>
        <input
          id="filter-date-to"
          type="date"
          value={filters.dateTo ?? ''}
          onChange={(e) => update({ dateTo: e.target.value || undefined })}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </div>

      <SearchInput
        id="filter-medication"
        type="text"
        dir="auto"
        placeholder={t('filterMedicationPlaceholder')}
        value={filters.medicationName ?? ''}
        onChange={(e) => update({ medicationName: e.target.value || undefined })}
        className="min-w-[200px] flex-1"
        aria-label={t('filterMedication')}
      />

      <select
        id="filter-sync-status"
        value={filters.syncStatus ?? ''}
        onChange={(e) =>
          update({ syncStatus: (e.target.value || undefined) as SyncStatus | undefined })
        }
        className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
        aria-label={t('filterSyncStatus')}
      >
        <option value="">{t('filterAll')}</option>
        <option value="synced">{t('filterSynced')}</option>
        <option value="pending">{t('filterPending')}</option>
        <option value="failed">{t('filterFailed')}</option>
      </select>
    </div>
  )
}

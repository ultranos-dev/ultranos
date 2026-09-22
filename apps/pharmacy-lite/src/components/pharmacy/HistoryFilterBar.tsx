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

  const syncStatusValue: SyncStatus | 'all' = filters.syncStatus ?? 'all'
  const syncTabs: { key: SyncStatus | 'all'; labelKey: string }[] = [
    { key: 'all', labelKey: 'filterAll' },
    { key: 'synced', labelKey: 'filterSynced' },
    { key: 'pending', labelKey: 'filterPending' },
    { key: 'failed', labelKey: 'filterFailed' },
  ]

  // `contents` lets these controls participate directly in the parent toolbar's
  // flex row (single Notifications-style row: search -> sync-status pills -> dates).
  return (
    <div data-testid="history-filter-bar" className="contents">
      <SearchInput
        id="filter-medication"
        type="text"
        dir="auto"
        placeholder={t('filterMedicationPlaceholder')}
        value={filters.medicationName ?? ''}
        onChange={(e) => update({ medicationName: e.target.value || undefined })}
        className="min-w-[200px] flex-1"
        inputClassName="h-9 rounded-full"
        aria-label={t('filterMedication')}
      />

      <div
        role="tablist"
        aria-label={t('filterSyncStatus')}
        className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit"
      >
        {syncTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={syncStatusValue === tab.key}
            onClick={() =>
              update({ syncStatus: tab.key === 'all' ? undefined : (tab.key as SyncStatus) })
            }
            className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
              syncStatusValue === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <input
        id="filter-date-from"
        type="date"
        aria-label={t('filterFrom')}
        value={filters.dateFrom ?? ''}
        onChange={(e) => update({ dateFrom: e.target.value || undefined })}
        className="h-9 rounded-full border border-border bg-background px-3 text-sm text-foreground"
      />

      <input
        id="filter-date-to"
        type="date"
        aria-label={t('filterTo')}
        value={filters.dateTo ?? ''}
        onChange={(e) => update({ dateTo: e.target.value || undefined })}
        className="h-9 rounded-full border border-border bg-background px-3 text-sm text-foreground"
      />
    </div>
  )
}

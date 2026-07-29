'use client'

import { useTranslations } from 'next-intl'
import type { LabLogbookEntry, LogbookFilter } from '@/lib/db'
import { LOINC_CATEGORIES } from '@/lib/loinc-categories'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import { BookOpen, FileSearch } from '@ultranos/ui-kit/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/Button'

interface LogbookListProps {
  entries: LabLogbookEntry[]
  loading: boolean
  error: string | null
  filter: LogbookFilter
  onFilterChange: (updates: Partial<LogbookFilter>) => void
  hasMore: boolean
  onLoadMore: () => Promise<void>
  loadingMore: boolean
  total: number
  onExportPdf: () => Promise<void>
  exporting: boolean
}

function StatusBadge({ status }: { status: LabLogbookEntry['authorizationStatus'] }) {
  const t = useTranslations('logbook')
  const variant = status === 'authorized' ? 'success' : 'warning'
  const label = status === 'authorized' ? t('authorized') : t('amended')
  return <Badge variant={variant}>{label}</Badge>
}

function AmendmentIndicator({ seqNo }: { amendmentOf: string; seqNo: number }) {
  const t = useTranslations('logbook')
  return (
    <span className="ms-2 text-xs text-warning">
      ↳ {t('amendmentOf', { seqNo })}
    </span>
  )
}

export function LogbookList({
  entries,
  loading,
  error,
  filter,
  onFilterChange,
  hasMore,
  onLoadMore,
  loadingMore,
  onExportPdf,
  exporting,
}: LogbookListProps) {
  const t = useTranslations('logbook')

  const testTypes = LOINC_CATEGORIES.map((c) => c.label)
  const technicianIds = Array.from(new Set(entries.map((e) => e.technicianId)))
  const filtersActive = Boolean(
    filter.dateFrom || filter.dateTo || filter.testType || filter.patientRef || filter.technicianId,
  )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: search + filters + export — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          type="text"
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={filter.patientRef ?? ''}
          onChange={(e) => onFilterChange({ patientRef: e.target.value || undefined })}
          className="min-w-[200px] flex-1"
          aria-label={t('filterByPatient')}
        />
        <input
          type="date"
          value={filter.dateFrom ?? ''}
          onChange={(e) => onFilterChange({ dateFrom: e.target.value || undefined })}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={`${t('filterByDate')} (from)`}
        />
        <input
          type="date"
          value={filter.dateTo ?? ''}
          onChange={(e) => onFilterChange({ dateTo: e.target.value || undefined })}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={`${t('filterByDate')} (to)`}
        />
        <select
          value={filter.testType ?? ''}
          onChange={(e) => onFilterChange({ testType: e.target.value || undefined })}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('filterByTestType')}
        >
          <option value="">{t('filterByTestType')}</option>
          {testTypes.map((tt) => (
            <option key={tt} value={tt}>{tt}</option>
          ))}
        </select>
        <select
          value={filter.technicianId ?? ''}
          onChange={(e) => onFilterChange({ technicianId: e.target.value || undefined })}
          className="rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm"
          aria-label={t('filterByTechnician')}
        >
          <option value="">{t('filterByTechnician')}</option>
          {technicianIds.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
        <Button
          variant="primary"
          onClick={onExportPdf}
          disabled={exporting || entries.length === 0}
          aria-label={t('exportPdf')}
        >
          {exporting ? t('exporting') : t('exportPdf')}
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl bg-warning/10 p-3 text-sm text-warning" role="alert">
          {error}
        </div>
      )}

      {/* Content box — single cohesive box (loading / empty / table) */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            {t('loadingMore')}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={filtersActive ? FileSearch : BookOpen}
              title={filtersActive ? t('noResults') : t('noEntries')}
              action={filtersActive ? { label: t('clearFilters'), onClick: () => onFilterChange({ dateFrom: undefined, dateTo: undefined, testType: undefined, patientRef: undefined, technicianId: undefined }) } : undefined}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm" role="grid">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('seqNo')}</th>
                  <th className="px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('date')}</th>
                  <th className="px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('patientRef')}</th>
                  <th className="hidden px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide sm:table-cell">{t('age')}</th>
                  <th className="px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('testType')}</th>
                  <th className="hidden px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide lg:table-cell">{t('resultSummary')}</th>
                  <th className="px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('technician')}</th>
                  <th className="hidden px-3 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide md:table-cell">{t('authStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`transition-colors hover:bg-muted/50 ${
                      entry.entryType === 'amendment' ? 'bg-warning/10' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {entry.displayNumber}
                      {entry.entryType === 'amendment' && entry.amendmentOf && (
                        <AmendmentIndicator amendmentOf={entry.amendmentOf} seqNo={entry.seqNo} />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 text-foreground">
                      <span className="font-medium">{entry.patientFirstName}</span>
                      <span className="ms-1 text-xs text-muted-foreground">({entry.patientRef})</span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-foreground sm:table-cell">{entry.patientAge}</td>
                    <td className="px-3 py-2.5 text-foreground">{entry.testType}</td>
                    <td className="hidden px-3 py-2.5 text-foreground lg:table-cell">
                      <span className="line-clamp-2">{entry.resultSummary}</span>
                    </td>
                    <td className="px-3 py-2.5 text-foreground">{entry.technicianName}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <StatusBadge status={entry.authorizationStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Load more — below the content box */}
      {hasMore && !loading && entries.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-auto w-fit"
        >
          {loadingMore ? t('loadingMore') : t('loadMore')}
        </Button>
      )}
    </div>
  )
}

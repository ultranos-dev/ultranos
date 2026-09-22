'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SearchInput } from '@ultranos/ui-kit/components/ui/search-input'
import {
  usePrioritizedWorklist,
  type WorklistMode,
  type WorklistStatusFilter,
} from '@/hooks/usePrioritizedWorklist'
import { PriorityWorklist } from '@/components/worklist/PriorityWorklist'
import { IncompleteVerificationsAlert } from '@/components/verification/IncompleteVerificationsAlert'

/**
 * Smart Sample Prioritization Worklist page.
 *
 * Features:
 *  - Algorithm-sorted worklist (Auto mode) with 60-second auto-refresh
 *  - Manual mode: drag-reorder only, no auto-resort
 *  - Stability countdowns and expiry warnings
 *  - Batch grouping indicator for same-type tests
 *
 * Works fully offline — all computation is Dexie-local.
 * CLAUDE.md Rule #7: only first name + age displayed.
 */
export default function WorklistPage() {
  const t = useTranslations('worklist')
  const {
    samples,
    loading,
    error,
    mode,
    setMode,
    statusFilter,
    setStatusFilter,
    reorder,
    resetOverride,
    setArchived,
  } = usePrioritizedWorklist()
  const [search, setSearch] = useState('')
  const isArchivedView = statusFilter === 'archived'

  const query = search.trim().toLowerCase()
  const filteredSamples = useMemo(
    () =>
      query
        ? samples.filter(
            (s) =>
              (s.sampleId ?? '').toLowerCase().includes(query) ||
              (s.orderId ?? '').toLowerCase().includes(query),
          )
        : samples,
    [samples, query],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* Toolbar: search + Auto / Manual mode pills — one row */}
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
        {/* Status filter — Active / Archived shelf */}
        <div role="tablist" aria-label={t('statusFilter.label')} className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
          {(['active', 'archived'] as WorklistStatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              onClick={() => setStatusFilter(s)}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={statusFilter === s}
              aria-label={t(`statusFilter.${s}`)}
            >
              {t(`statusFilter.${s}`)}
            </button>
          ))}
        </div>

        {/* Auto / Manual sort mode — active shelf only (reordering an archived shelf is meaningless) */}
        {!isArchivedView && (
          <div role="tablist" className="flex h-9 items-stretch gap-1 rounded-full border border-border bg-card p-1 w-fit">
            {(['auto', 'manual'] as WorklistMode[]).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                onClick={() => setMode(m)}
                className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={mode === m}
                aria-label={t(`mode.${m}`)}
              >
                {t(`mode.${m}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Supervisor filter: samples with incomplete identity verification (AC 4.4) */}
      <IncompleteVerificationsAlert />

      {/* Mode description */}
      {mode === 'manual' && !isArchivedView && (
        <div className="rounded-2xl bg-warning/10 px-4 py-2 text-sm text-warning">
          {t('manualModeInfo')}
        </div>
      )}

      {/* Stats bar */}
      {!loading && !error && filteredSamples.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-muted-foreground">
            <strong className="text-foreground">{filteredSamples.length}</strong> {t('samplesInQueue')}
          </span>
          {filteredSamples.filter((s) => s.urgency === 'stat').length > 0 && (
            <span className="font-medium text-destructive">
              {filteredSamples.filter((s) => s.urgency === 'stat').length} STAT
            </span>
          )}
          {filteredSamples.filter((s) => s.stabilityStatus === 'expired').length > 0 && (
            <span className="font-medium text-destructive">
              {filteredSamples.filter((s) => s.stabilityStatus === 'expired').length} {t('expired')}
            </span>
          )}
          {filteredSamples.filter((s) => s.stabilityStatus === 'critical').length > 0 && (
            <span className="font-medium text-warning">
              {filteredSamples.filter((s) => s.stabilityStatus === 'critical').length} {t('critical')}
            </span>
          )}
        </div>
      )}

      {/* Worklist */}
      <PriorityWorklist
        samples={filteredSamples}
        loading={loading}
        error={error}
        onReorder={reorder}
        onResetOverride={resetOverride}
        isArchivedView={isArchivedView}
        onArchiveToggle={setArchived}
      />
    </div>
  )
}

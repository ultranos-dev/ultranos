'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { LabLogbookEntry, LogbookFilter } from '@/lib/db'
import { LOINC_CATEGORIES } from '@/lib/loinc-categories'
import { exportLogbookPdf } from '@/lib/logbook-pdf'
import { reportLogbookEvent } from '@/lib/audit-client'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useLocale } from 'next-intl'

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
  const colors =
    status === 'authorized'
      ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
      : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
  const label = status === 'authorized' ? t('authorized') : t('amended')
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}>
      {label}
    </span>
  )
}

function AmendmentIndicator({ amendmentOf, seqNo }: { amendmentOf: string; seqNo: number }) {
  const t = useTranslations('logbook')
  return (
    <span className="ms-2 text-xs text-amber-600">
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
  total,
  onExportPdf,
  exporting,
}: LogbookListProps) {
  const t = useTranslations('logbook')

  const testTypes = LOINC_CATEGORIES.map((c) => c.label)

  // Collect unique technician IDs from loaded entries for the filter dropdown
  const technicianIds = Array.from(new Set(entries.map((e) => e.technicianId)))

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t('loadingMore')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('title')}</h1>
        <button
          onClick={onExportPdf}
          disabled={exporting || entries.length === 0}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={t('exportPdf')}
        >
          {exporting ? t('exporting') : t('exportPdf')}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700" role="alert">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filterByDate')} (from)</label>
          <input
            type="date"
            value={filter.dateFrom ?? ''}
            onChange={(e) => onFilterChange({ dateFrom: e.target.value || undefined })}
            className="rounded border border-border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filterByDate')} (to)</label>
          <input
            type="date"
            value={filter.dateTo ?? ''}
            onChange={(e) => onFilterChange({ dateTo: e.target.value || undefined })}
            className="rounded border border-border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {/* Test type */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filterByTestType')}</label>
          <select
            value={filter.testType ?? ''}
            onChange={(e) => onFilterChange({ testType: e.target.value || undefined })}
            className="rounded border border-border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t('filterByTestType')}</option>
            {testTypes.map((tt) => (
              <option key={tt} value={tt}>
                {tt}
              </option>
            ))}
          </select>
        </div>
        {/* Technician */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t('filterByTechnician')}</label>
          <select
            value={filter.technicianId ?? ''}
            onChange={(e) => onFilterChange({ technicianId: e.target.value || undefined })}
            className="rounded border border-border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{t('filterByTechnician')}</option>
            {technicianIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
        {/* Patient ref search */}
        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <label className="text-xs font-medium text-muted-foreground">{t('filterByPatient')}</label>
          <input
            type="search"
            value={filter.patientRef ?? ''}
            onChange={(e) => onFilterChange({ patientRef: e.target.value || undefined })}
            placeholder={t('searchPlaceholder')}
            className="rounded border border-border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {entries.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {filter.dateFrom || filter.dateTo || filter.testType || filter.patientRef || filter.technicianId
              ? t('noResults')
              : t('noEntries')}
          </div>
        ) : (
          <table className="w-full text-sm" role="grid">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left">
                <th className="px-3 py-2.5 font-medium text-foreground">{t('seqNo')}</th>
                <th className="px-3 py-2.5 font-medium text-foreground">{t('date')}</th>
                <th className="px-3 py-2.5 font-medium text-foreground">{t('patientRef')}</th>
                <th className="hidden px-3 py-2.5 font-medium text-foreground sm:table-cell">Age</th>
                <th className="px-3 py-2.5 font-medium text-foreground">{t('testType')}</th>
                <th className="hidden px-3 py-2.5 font-medium text-foreground lg:table-cell">{t('resultSummary')}</th>
                <th className="px-3 py-2.5 font-medium text-foreground">{t('technician')}</th>
                <th className="hidden px-3 py-2.5 font-medium text-foreground md:table-cell">{t('authStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-b border-border/50 last:border-0 hover:bg-muted/30 ${
                    entry.entryType === 'amendment' ? 'bg-amber-50/30' : ''
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
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-auto flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? t('loadingMore') : t('loadMore')}
        </button>
      )}
    </div>
  )
}

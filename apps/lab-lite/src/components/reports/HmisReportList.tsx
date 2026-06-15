'use client'

import { useTranslations } from 'next-intl'
import { useHmisReports } from '@/hooks/useHmisReports'
import type { HmisMonthlyReport } from '@/lib/hmis-types'
import { formatReportingPeriod } from '@/lib/hmis-template'

interface HmisReportListProps {
  year: number
  onSelect: (report: HmisMonthlyReport) => void
}

export function HmisReportList({ year, onSelect }: HmisReportListProps) {
  const t = useTranslations('hmisReport')
  const { reports, loading, error } = useHmisReports(year)

  if (loading) {
    return (
      <div className="mt-4 text-sm text-muted-foreground" aria-busy="true">
        {t('generating')}…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-4 text-sm text-destructive" role="alert">
        {error}
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className="mt-4 text-sm text-muted-foreground">
        {t('noReports')}
      </div>
    )
  }

  return (
    <ul className="mt-4 space-y-2" aria-label={t('reportHistory')}>
      {reports.map((report) => (
        <li key={report.id}>
          <button
            onClick={() => onSelect(report)}
            className="w-full flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring transition-colors text-start"
          >
            <span>{formatReportingPeriod(report.reportYear, report.reportMonth)}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                report.status === 'finalized'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {report.status === 'finalized' ? t('statusFinalized') : t('statusDraft')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

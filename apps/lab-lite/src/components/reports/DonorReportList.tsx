'use client'

// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report List
// Lists past donor reports grouped by program, with status badges.
// Draft reports are editable; finalized reports are view-only with re-export.
// ---------------------------------------------------------------------------

import { useTranslations } from 'next-intl'
import { useDonorReports } from '@/hooks/useDonorReports'
import type { DonorReport } from '@/lib/donor-types'

interface Props {
  programCode?: string
  onOpenReport: (report: DonorReport) => void
}

export function DonorReportList({ programCode, onOpenReport }: Props) {
  const t = useTranslations('donorReport')
  const { reports, loading } = useDonorReports({ programCode })

  if (loading) return <p className="text-sm text-gray-400 animate-pulse">Loading…</p>

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center">
        <p className="text-sm text-gray-500">{t('noReports')}</p>
      </div>
    )
  }

  // Group by programCode
  const grouped = new Map<string, DonorReport[]>()
  for (const r of reports) {
    if (!grouped.has(r.programCode)) grouped.set(r.programCode, [])
    grouped.get(r.programCode)!.push(r)
  }

  return (
    <div className="space-y-4" data-testid="donor-report-list">
      <h2 className="text-sm font-semibold text-gray-700">{t('reportHistory')}</h2>
      {Array.from(grouped.entries()).map(([code, groupReports]) => (
        <div key={code} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              {groupReports[0]?.programName} ({code})
            </h3>
          </div>
          <ul className="divide-y divide-gray-100">
            {groupReports.map((r) => (
              <li key={r.id} className="flex items-center px-3 py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {r.periodStart} — {r.periodEnd}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(r.generatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  r.status === 'finalized'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {r.status === 'finalized' ? t('statusFinalized') : t('statusDraft')}
                </span>
                <button
                  onClick={() => onOpenReport(r)}
                  className="flex-shrink-0 text-xs text-blue-600 hover:underline"
                  data-testid={`open-report-${r.id}`}
                >
                  {r.status === 'finalized' ? t('exportPdf') : t('reviewTitle')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

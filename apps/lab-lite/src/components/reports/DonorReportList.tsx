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

  if (loading) return <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>

  if (reports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <p className="text-sm text-muted-foreground">{t('noReports')}</p>
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
      <h2 className="text-sm font-semibold text-foreground">{t('reportHistory')}</h2>
      {Array.from(grouped.entries()).map(([code, groupReports]) => (
        <div key={code} className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="bg-muted px-3 py-2 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {groupReports[0]?.programName} ({code})
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {groupReports.map((r) => (
              <li key={r.id} className="flex items-center px-3 py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.periodStart} — {r.periodEnd}
                  </p>
                  <p className="text-xs text-muted-foreground">
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
                  className="flex-shrink-0 text-xs text-primary hover:underline"
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

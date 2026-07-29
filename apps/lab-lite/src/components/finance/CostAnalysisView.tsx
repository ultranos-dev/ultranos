'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getAllTestCostConfigs, getLabOverheadConfig } from '@/lib/db'
import {
  calculateAllTestCosts,
  computeCostSummary,
  getRecommendation,
  type CostAnalysis,
} from '@/lib/cost-calculator'
import { exportCostAnalysisCSV, exportCostAnalysisPDF } from '@/lib/cost-export'

type SortKey = keyof Pick<
  CostAnalysis,
  | 'testName'
  | 'reagentCostPerTest'
  | 'consumableCost'
  | 'laborAllocation'
  | 'overheadAllocation'
  | 'totalCost'
  | 'currentPrice'
  | 'margin'
  | 'marginPercent'
>

type SortDir = 'asc' | 'desc'

const formatAFN = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const STALE_DAYS_THRESHOLD = 90

export function CostAnalysisView() {
  const t = useTranslations('finance.cost.analysis')
  const tCommon = useTranslations('common')
  const session = useAuthSessionStore((s) => s.session)

  const [analyses, setAnalyses] = useState<CostAnalysis[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('testName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [staleWarningDays, setStaleWarningDays] = useState<number | null>(null)

  const isManager = session?.labRole === LabRole.LAB_MANAGER

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [configs, overhead] = await Promise.all([
        getAllTestCostConfigs(),
        getLabOverheadConfig(),
      ])
      if (cancelled) return

      const result = calculateAllTestCosts(configs)
      setAnalyses(result)

      // Check if overhead config is stale (> 90 days)
      if (overhead?.lastUpdated) {
        const updatedAt = new Date(overhead.lastUpdated)
        const daysSince = Math.floor(
          (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24),
        )
        if (daysSince > STALE_DAYS_THRESHOLD) {
          setStaleWarningDays(daysSince)
        }
      }

      setIsLoaded(true)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const summary = useMemo(() => computeCostSummary(analyses), [analyses])

  const sorted = useMemo(() => {
    return [...analyses].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      const an = av as number
      const bn = bv as number
      return sortDir === 'asc' ? an - bn : bn - an
    })
  }, [analyses, sortKey, sortDir])

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir('asc')
      }
    },
    [sortKey],
  )

  const subsidizedWithRecs = useMemo(
    () =>
      analyses
        .filter((a) => !a.isProfitable)
        .map((a) => ({ analysis: a, recommendation: getRecommendation(a) }))
        .filter((x) => x.recommendation !== null),
    [analyses],
  )

  if (!isManager) {
    return (
      <div className="p-6 text-sm text-red-600" role="alert">
        Access restricted to Lab Managers.
      </div>
    )
  }

  if (!isLoaded) {
    return <div className="p-6 text-sm text-muted-foreground">{tCommon('loading')}</div>
  }

  if (analyses.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('emptyState')}</p>
      </div>
    )
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <span className="ms-1 text-gray-300">↕</span>
    return (
      <span className="ms-1 text-primary" aria-hidden="true">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-4 print:p-0">
      <h1 className="text-xl font-semibold print:text-2xl">{t('title')}</h1>

      {/* Stale data warning */}
      {staleWarningDays !== null && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700" role="alert">
          {/* t('staleWarning') is in settings namespace, use inline string here */}
          Cost data last updated {staleWarningDays} days ago — may not reflect current costs.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
        <SummaryCard label={t('summaryTotalTests')} value={String(summary.totalTests)} color="gray" />
        <SummaryCard label={t('summaryProfitable')} value={String(summary.profitableCount)} color="green" />
        <SummaryCard label={t('summarySubsidized')} value={String(summary.subsidizedCount)} color="red" />
        <SummaryCard
          label={t('summaryAvgMargin')}
          value={summary.averageMarginPercent !== null ? `${summary.averageMarginPercent.toFixed(1)}%` : '—'}
          color={
            summary.averageMarginPercent === null
              ? 'gray'
              : summary.averageMarginPercent >= 0
              ? 'green'
              : 'red'
          }
        />
      </div>

      {/* Export buttons */}
      <div className="flex gap-3 print:hidden">
        <button
          onClick={() => exportCostAnalysisCSV(analyses)}
          className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          {/* finance.cost.export.exportCSV */}
          Export CSV
        </button>
        <button
          onClick={() => exportCostAnalysisPDF()}
          className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          {/* finance.cost.export.exportPDF */}
          Print / PDF
        </button>
      </div>

      {/* Test-by-test table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-sm" aria-label={t('title')}>
          <thead className="bg-muted">
            <tr>
              {(
                [
                  ['testName', t('columnTestName')],
                  ['reagentCostPerTest', t('columnReagent')],
                  ['consumableCost', t('columnConsumable')],
                  ['laborAllocation', t('columnLabor')],
                  ['overheadAllocation', t('columnOverhead')],
                  ['totalCost', t('columnTotalCost')],
                  ['currentPrice', t('columnPrice')],
                  ['margin', t('columnMargin')],
                  ['marginPercent', t('columnMarginPct')],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  scope="col"
                  className="px-4 py-3 text-start font-medium text-foreground cursor-pointer select-none hover:bg-muted"
                  onClick={() => handleSort(key)}
                  aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {label}
                  <SortIcon col={key} />
                </th>
              ))}
              <th scope="col" className="px-4 py-3 text-start font-medium text-foreground">
                {t('columnStatus')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((a) => (
              <tr
                key={a.testCode}
                className={a.isProfitable ? undefined : 'bg-red-50'}
              >
                <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{a.testName}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatAFN(a.reagentCostPerTest)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatAFN(a.consumableCost)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatAFN(a.laborAllocation)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatAFN(a.overheadAllocation)}</td>
                <td className="px-4 py-2 font-medium text-foreground">{formatAFN(a.totalCost)}</td>
                <td className="px-4 py-2 text-muted-foreground">{formatAFN(a.currentPrice)}</td>
                <td className={`px-4 py-2 font-medium ${a.margin >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatAFN(a.margin)}
                </td>
                <td className={`px-4 py-2 ${a.marginPercent === null ? 'text-muted-foreground' : a.marginPercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {a.marginPercent === null ? t('noPriceSet') : `${a.marginPercent.toFixed(1)}%`}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.isProfitable
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {a.isProfitable ? t('statusProfitable') : t('statusSubsidized')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Recommendations panel */}
      {subsidizedWithRecs.length > 0 && (
        <section aria-labelledby="recommendations-heading" className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2 print:border-border print:bg-card">
          <h2 id="recommendations-heading" className="text-base font-medium text-amber-800">
            {t('recommendationsTitle')}
          </h2>
          <ul className="space-y-1">
            {subsidizedWithRecs.map(({ analysis, recommendation }) => (
              <li key={analysis.testCode} className="text-sm text-amber-700">
                <span className="font-medium">{analysis.testName}:</span>{' '}
                {recommendation}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: 'gray' | 'green' | 'red'
}) {
  const colorClasses = {
    gray: 'bg-muted text-foreground',
    green: 'bg-green-50 text-green-800',
    red: 'bg-red-50 text-red-800',
  }
  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-75">{label}</div>
    </div>
  )
}

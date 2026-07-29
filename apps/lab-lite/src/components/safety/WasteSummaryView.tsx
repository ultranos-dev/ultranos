'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ContainerType } from '@/types/waste-tracking'
import type { WasteSummary } from '@/types/waste-tracking'
import { generateMonthlySummary } from '@/lib/safety/waste-summary'

export function WasteSummaryView() {
  const t = useTranslations('safety.waste')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [summary, setSummary] = useState<WasteSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const result = await generateMonthlySummary(year, month)
      setSummary(result)
      setLoading(false)
    }
    void load()
  }, [year, month])

  function goToPreviousMonth() {
    if (month === 1) {
      setMonth(12)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function goToNextMonth() {
    const current = new Date()
    const next = month === 12 ? new Date(year + 1, 0) : new Date(year, month)
    if (next > current) return

    if (month === 12) {
      setMonth(1)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  const TYPE_COLORS: Record<ContainerType, string> = {
    [ContainerType.SHARPS]: 'bg-red-500',
    [ContainerType.INFECTIOUS]: 'bg-amber-500',
    [ContainerType.CHEMICAL]: 'bg-purple-500',
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('summaryTitle')}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="rounded px-2 py-1 text-sm hover:bg-muted"
            aria-label={t('previousMonth')}
          >
            &larr;
          </button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            {new Date(year, month - 1).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
            })}
          </span>
          <button
            type="button"
            onClick={goToNextMonth}
            className="rounded px-2 py-1 text-sm hover:bg-muted"
            aria-label={t('nextMonth')}
          >
            &rarr;
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-muted"
              aria-busy="true"
            />
          ))}
        </div>
      ) : summary ? (
        <>
          {/* Total disposed card */}
          <div className="rounded-lg border border-border p-4 text-center">
            <p className="text-3xl font-bold">
              {summary.totalContainersDisposed}
            </p>
            <p className="text-sm text-muted-foreground">{t('totalDisposed')}</p>
          </div>

          {/* Breakdown by type */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium mb-3">{t('byType')}</h3>
            <div className="flex flex-col gap-2">
              {Object.values(ContainerType).map((type) => {
                const count = summary.byType[type] ?? 0
                const max = Math.max(
                  ...Object.values(summary.byType),
                  1,
                )
                const pct = (count / max) * 100

                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-xs w-24 text-end">
                      {t(`type.${type}`)}
                    </span>
                    <div className="flex-1 h-4 bg-muted rounded-full">
                      <div
                        className={`h-4 rounded-full ${TYPE_COLORS[type]}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs w-8 font-medium">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Breakdown by location */}
          {Object.keys(summary.byLocation).length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <h3 className="text-sm font-medium mb-3">{t('byLocation')}</h3>
              <ul className="flex flex-col gap-1">
                {Object.entries(summary.byLocation)
                  .sort((a, b) => b[1] - a[1])
                  .map(([loc, count]) => (
                    <li
                      key={loc}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{loc}</span>
                      <span className="font-medium">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Average fill times */}
          <div className="rounded-lg border border-border p-4">
            <h3 className="text-sm font-medium mb-3">{t('avgFillTimes')}</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              {Object.values(ContainerType).map((type) => (
                <div key={type}>
                  <p className="text-xl font-bold">
                    {summary.averageFillDaysByType[type] || '\u2014'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`type.${type}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('days')}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Compliance notes */}
          {summary.complianceNotes.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-medium text-amber-800 mb-2">
                {t('complianceNotes')}
              </h3>
              <ul className="text-sm text-amber-700 list-disc list-inside">
                {summary.complianceNotes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

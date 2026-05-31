'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getHistoricalPatterns, type WorkloadPatterns } from '@/lib/workload-service'

type DateRange = 7 | 14 | 30

// ---------------------------------------------------------------------------
// CSS bar chart — no external library (bundle size constraint)
// ---------------------------------------------------------------------------

function BarChart({
  data,
  maxValue,
  label,
}: {
  data: Record<string, number>
  maxValue: number
  label: (key: string) => string
}) {
  if (maxValue === 0) return null
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])

  return (
    <ul className="space-y-1.5" role="list">
      {entries.map(([key, value]) => (
        <li key={key} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-xs text-neutral-500">{label(key)}</span>
          <div className="flex-1 rounded bg-neutral-100">
            <div
              className="h-4 rounded bg-blue-400 transition-all"
              style={{ width: `${Math.round((value / maxValue) * 100)}%` }}
              aria-label={`${value}`}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-neutral-700">
            {Math.round(value)}
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Peak hour display — text summary, no chart library
// ---------------------------------------------------------------------------

function PeakHourSummary({
  peakHours,
  t,
}: {
  peakHours: Record<number, number>
  t: ReturnType<typeof useTranslations<'workload'>>
}) {
  const entries = Object.entries(peakHours)
    .map(([h, c]) => ({ hour: Number(h), count: c }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)

  if (entries.length === 0) return <p className="text-xs text-neutral-400">{t('noData')}</p>

  return (
    <ul className="space-y-1 text-xs text-neutral-600">
      {entries.map(({ hour, count }) => (
        <li key={hour}>
          <span className="font-medium">{formatHour(hour)}</span> — {count} {t('samples')}
        </li>
      ))}
    </ul>
  )
}

function formatHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:00 ${ampm}`
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface WorkloadPatternsProps {
  /** Map techId → display label (e.g. "Tech #3"). No PHI. */
  techLabels?: Record<string, string>
}

export function WorkloadPatternsView({ techLabels = {} }: WorkloadPatternsProps) {
  const t = useTranslations('workload')
  const [range, setRange] = useState<DateRange>(30)
  const [patterns, setPatterns] = useState<WorkloadPatterns | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getHistoricalPatterns(range)
      if (!cancelledRef.current) {
        setPatterns(data)
        setLoading(false)
      }
    } catch {
      if (!cancelledRef.current) {
        setError(t('errorLoadingPatterns'))
        setLoading(false)
      }
    }
  }, [range, t])

  useEffect(() => {
    cancelledRef.current = false
    load()
    return () => {
      cancelledRef.current = true
    }
  }, [load])

  const techLabel = (techId: string) => techLabels[techId] ?? techId.slice(-6)

  const maxAvg = patterns
    ? Math.max(...Object.values(patterns.avgSamplesPerTechPerShift), 1)
    : 0

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-600">{t('dateRange')}:</span>
        {([7, 14, 30] as DateRange[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setRange(d)}
            className={`rounded px-2 py-1 text-xs font-medium ${
              range === d
                ? 'bg-blue-600 text-white'
                : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {t('lastNDays', { n: d })}
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2" aria-busy="true" aria-label={t('loading')}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-neutral-200" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      )}

      {!loading && !error && patterns && (
        <>
          {/* Snapshot count */}
          <p className="text-xs text-neutral-400">
            {t('basedOnSnapshots', { count: patterns.snapshotCount })}
          </p>

          {/* Average load per tech */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t('avgSamplesPerShift')}</h3>
            {Object.keys(patterns.avgSamplesPerTechPerShift).length === 0 ? (
              <p className="text-xs text-neutral-400">{t('noData')}</p>
            ) : (
              <BarChart
                data={patterns.avgSamplesPerTechPerShift}
                maxValue={maxAvg}
                label={techLabel}
              />
            )}
          </section>

          {/* Overloaded techs */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t('overloaded')}</h3>
            {patterns.overloadedTechs.length === 0 ? (
              <p className="text-xs text-neutral-400">{t('noneIdentified')}</p>
            ) : (
              <ul className="space-y-0.5 text-xs text-red-700">
                {patterns.overloadedTechs.map((id) => (
                  <li key={id}>• {techLabel(id)}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Underutilized techs */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t('underutilized')}</h3>
            {patterns.underutilizedTechs.length === 0 ? (
              <p className="text-xs text-neutral-400">{t('noneIdentified')}</p>
            ) : (
              <ul className="space-y-0.5 text-xs text-amber-700">
                {patterns.underutilizedTechs.map((id) => (
                  <li key={id}>• {techLabel(id)}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Peak hours */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-neutral-700">{t('peakHours')}</h3>
            <PeakHourSummary peakHours={patterns.peakHours} t={t} />
          </section>
        </>
      )}
    </div>
  )
}

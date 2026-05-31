'use client'

/**
 * Story 43.2 — QC History View
 *
 * Renders the QC run history for a given analyte/instrument as a table.
 * Includes a Levey-Jennings style trend visualization (SVG line chart)
 * showing control values over time with ±2SD and ±3SD reference lines.
 *
 * RTL: uses logical CSS properties throughout.
 * No PHI — QC data is purely operational.
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getQcRunHistory } from '@/services/qc-run-service'
import type { QcRun } from '@/lib/db'

interface QcHistoryViewProps {
  analyte: string
  instrumentId: string
  analyteDisplayName?: string
}

function LeveyJenningsChart({ runs }: { runs: QcRun[] }) {
  if (runs.length < 2) return null

  // Use the first measured value parameter found in the control values
  const paramKey = Object.keys(runs[0]?.controlValues ?? {})[0]
  if (!paramKey) return null

  const values = runs
    .slice()
    .reverse() // chronological order for the chart
    .map((r) => r.controlValues[paramKey] ?? 0)

  const expectedRange = runs[0]?.expectedRange ?? { low: 0, high: 1 }
  const mid = (expectedRange.low + expectedRange.high) / 2
  const sd = (expectedRange.high - expectedRange.low) / 6 // ±3SD spans the range

  const width = 420
  const height = 140
  const padX = 30
  const padY = 16

  const minVal = Math.min(...values, mid - 3.5 * sd)
  const maxVal = Math.max(...values, mid + 3.5 * sd)
  const range = maxVal - minVal || 1

  function toX(i: number) {
    return padX + (i / Math.max(values.length - 1, 1)) * (width - 2 * padX)
  }
  function toY(v: number) {
    return padY + (1 - (v - minVal) / range) * (height - 2 * padY)
  }

  const linePoints = values.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Levey-Jennings QC trend chart"
      role="img"
      style={{ width: '100%', maxWidth: `${width}px`, height: 'auto', display: 'block' }}
    >
      {/* ±3SD lines — red */}
      {[mid + 3 * sd, mid - 3 * sd].map((v, i) => (
        <line
          key={`sd3-${i}`}
          x1={padX}
          y1={toY(v)}
          x2={width - padX}
          y2={toY(v)}
          stroke="#fca5a5"
          strokeWidth="1"
          strokeDasharray="4,2"
        />
      ))}
      {/* ±2SD lines — amber */}
      {[mid + 2 * sd, mid - 2 * sd].map((v, i) => (
        <line
          key={`sd2-${i}`}
          x1={padX}
          y1={toY(v)}
          x2={width - padX}
          y2={toY(v)}
          stroke="#fcd34d"
          strokeWidth="1"
          strokeDasharray="4,2"
        />
      ))}
      {/* Mean line — green */}
      <line
        x1={padX}
        y1={toY(mid)}
        x2={width - padX}
        y2={toY(mid)}
        stroke="#86efac"
        strokeWidth="1"
      />
      {/* Control value polyline */}
      <polyline points={linePoints} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      {/* Data points */}
      {values.map((v, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(v)}
          r={3}
          fill={v > mid + 3 * sd || v < mid - 3 * sd ? '#ef4444' : '#3b82f6'}
        />
      ))}
    </svg>
  )
}

export function QcHistoryView({ analyte, instrumentId, analyteDisplayName }: QcHistoryViewProps) {
  const t = useTranslations('qc')
  const [runs, setRuns] = useState<QcRun[]>([])
  const [loading, setLoading] = useState(true)

  const displayName = analyteDisplayName ?? analyte

  useEffect(() => {
    let active = true
    getQcRunHistory(analyte, instrumentId, 50)
      .then((data) => { if (active) { setRuns(data); setLoading(false) } })
      .catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [analyte, instrumentId])

  if (loading) {
    return <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{t('history.loading')}</p>
  }

  return (
    <section aria-labelledby="qc-history-heading">
      <h2
        id="qc-history-heading"
        style={{ fontSize: '1rem', fontWeight: 600, marginBlockEnd: '0.75rem' }}
      >
        {t('history.title', { analyte: displayName })}
      </h2>

      {runs.length === 0 ? (
        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{t('history.empty')}</p>
      ) : (
        <>
          <div style={{ marginBlockEnd: '1rem', overflowX: 'auto' }}>
            <LeveyJenningsChart runs={runs} />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBlockStart: '0.25rem' }}>
              {t('history.chartLegend')}
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
              aria-label={t('history.tableLabel', { analyte: displayName })}
            >
              <thead>
                <tr>
                  {[
                    t('history.col.date'),
                    t('history.col.controlLevel'),
                    t('history.col.measuredValues'),
                    t('history.col.expectedRange'),
                    t('history.col.result'),
                    t('history.col.tech'),
                  ].map((header) => (
                    <th
                      key={header}
                      scope="col"
                      style={{
                        textAlign: 'start',
                        paddingBlock: '0.5rem',
                        paddingInline: '0.75rem',
                        borderBottom: '1px solid #e5e7eb',
                        fontWeight: 600,
                        color: '#374151',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    style={{ borderBottom: '1px solid #f3f4f6' }}
                  >
                    <td style={{ paddingBlock: '0.5rem', paddingInline: '0.75rem', whiteSpace: 'nowrap' }}>
                      {run.calendarDate}
                    </td>
                    <td style={{ paddingBlock: '0.5rem', paddingInline: '0.75rem' }}>
                      {run.controlLevel}
                    </td>
                    <td style={{ paddingBlock: '0.5rem', paddingInline: '0.75rem', fontSize: '0.8rem', color: '#374151' }}>
                      {Object.entries(run.controlValues)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ')}
                    </td>
                    <td style={{ paddingBlock: '0.5rem', paddingInline: '0.75rem', whiteSpace: 'nowrap' }}>
                      {run.expectedRange.low}–{run.expectedRange.high}
                    </td>
                    <td style={{ paddingBlock: '0.5rem', paddingInline: '0.75rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          paddingInline: '0.375rem',
                          paddingBlock: '0.125rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: run.passOrFail === 'PASS' ? '#f0fdf4' : '#fef2f2',
                          color: run.passOrFail === 'PASS' ? '#166534' : '#991b1b',
                          border: `1px solid ${run.passOrFail === 'PASS' ? '#86efac' : '#fca5a5'}`,
                        }}
                      >
                        {run.passOrFail === 'PASS' ? t('result.pass') : t('result.fail')}
                      </span>
                    </td>
                    <td style={{ paddingBlock: '0.5rem', paddingInline: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
                      {run.techId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

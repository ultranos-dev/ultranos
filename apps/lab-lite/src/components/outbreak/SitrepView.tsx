'use client'

/**
 * Daily Situation Report View — Story 54.5 (AC #7, Task 10)
 *
 * Dashboard-style display of the current day's sitrep for the active outbreak.
 * Includes trend arrow vs. yesterday, stockout date color-coding, and export.
 *
 * No PHI — all fields are aggregate counts and rates (CLAUDE.md Rule #1).
 */

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { TrendingUp, TrendingDown, Minus, Download, RefreshCw } from '@ultranos/ui-kit/icons'
import { generateDailySitrep } from '@/lib/sitrep-generator'
import { getSitrepsByOutbreak } from '@/lib/db'
import { renderSitrepPDF } from '@/lib/sitrep-pdf'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { OutbreakModeConfig, DailySitrep } from '@/types/outbreak'

// ---------------------------------------------------------------------------
// Stockout date color-coding (AC #10.2):
//   green  > 14 days
//   amber  7–14 days
//   red    < 7 days
// ---------------------------------------------------------------------------

function stockoutColor(projectedStockoutDate: string | null): string {
  if (!projectedStockoutDate) return '#16a34a'  // green — no risk
  const daysUntil = Math.floor(
    (new Date(projectedStockoutDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  if (daysUntil < 7) return '#dc2626'   // red
  if (daysUntil < 14) return '#d97706'  // amber
  return '#16a34a'                       // green
}

function stockoutLabel(projectedStockoutDate: string | null): string {
  if (!projectedStockoutDate) return '> 30 days'
  const daysUntil = Math.floor(
    (new Date(projectedStockoutDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  return `${daysUntil} days (${projectedStockoutDate})`
}

// ---------------------------------------------------------------------------
// Trend indicator
// ---------------------------------------------------------------------------

function TrendIcon({ today, yesterday }: { today: number; yesterday?: number }) {
  if (yesterday === undefined) return <Minus size={16} color="#9ca3af" aria-hidden="true" />
  if (today > yesterday) return <TrendingUp size={16} color="#dc2626" aria-label="Increasing" />
  if (today < yesterday) return <TrendingDown size={16} color="#16a34a" aria-label="Decreasing" />
  return <Minus size={16} color="#9ca3af" aria-label="Unchanged" />
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  outbreakConfig: OutbreakModeConfig
}

export function SitrepView({ outbreakConfig }: Props) {
  const session = useAuthSessionStore((s) => s.session)
  const [sitreps, setSitreps] = useState<DailySitrep[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSitreps = useCallback(async () => {
    try {
      const all = await getSitrepsByOutbreak(outbreakConfig.id)
      setSitreps(all)
    } catch {
      setError('Failed to load situation reports.')
    } finally {
      setLoading(false)
    }
  }, [outbreakConfig.id])

  useEffect(() => {
    loadSitreps()
  }, [loadSitreps])

  const latestSitrep = sitreps[sitreps.length - 1] ?? null
  const previousSitrep = sitreps.length >= 2 ? sitreps[sitreps.length - 2] : undefined

  async function handleGenerateNow() {
    setGenerating(true)
    setError(null)
    try {
      await generateDailySitrep(outbreakConfig, {
        generatedBy: session?.practitionerId ?? 'system',
      })
      await loadSitreps()
    } catch {
      setError('Failed to generate situation report.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleExportPDF(sitrep: DailySitrep) {
    setExporting(sitrep.id)
    try {
      const blob = renderSitrepPDF(sitrep, outbreakConfig)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sitrep-${outbreakConfig.targetPathogen.code}-${sitrep.reportDate}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export PDF.')
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#6b7280' }}>Loading situation reports…</div>
  }

  return (
    <div data-testid="sitrep-view" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBlockEnd: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            Daily Situation Reports
          </h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
            {outbreakConfig.targetPathogen.display}
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerateNow}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.5rem 1rem', borderRadius: '6px',
            backgroundColor: '#dc2626', color: '#fff',
            border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: '0.875rem',
          }}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {generating ? 'Generating…' : 'Generate Now'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: '#dc2626', marginBlockEnd: '1rem', fontSize: '0.875rem' }}>
          {error}
        </p>
      )}

      {/* Today's metrics dashboard */}
      {latestSitrep && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem', marginBlockEnd: '2rem',
        }}>
          {/* Total tests */}
          <MetricCard
            label="Total Tests Today"
            value={latestSitrep.totalTestsPerformed}
            trend={<TrendIcon today={latestSitrep.totalTestsPerformed} yesterday={previousSitrep?.totalTestsPerformed} />}
          />
          {/* Positive count */}
          <MetricCard
            label="Positive Count"
            value={latestSitrep.positiveCount}
            valueColor="#dc2626"
            trend={<TrendIcon today={latestSitrep.positiveCount} yesterday={previousSitrep?.positiveCount} />}
            large
          />
          {/* Positivity rate */}
          <MetricCard
            label="Positivity Rate"
            value={`${latestSitrep.positivityRate}%`}
            trend={<TrendIcon today={latestSitrep.positivityRate} yesterday={previousSitrep?.positivityRate} />}
          />
          {/* Reagent burn rate */}
          <MetricCard
            label="Reagent Burn Rate"
            value={`${latestSitrep.reagentBurnRate} units/day`}
          />
          {/* Stockout date */}
          <div style={{
            backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
            padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
          }}>
            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Projected Stockout
            </span>
            <span style={{
              fontSize: '1rem', fontWeight: 700,
              color: stockoutColor(latestSitrep.projectedStockoutDate),
            }}>
              {stockoutLabel(latestSitrep.projectedStockoutDate)}
            </span>
          </div>
        </div>
      )}

      {/* Historical sitrep list */}
      {sitreps.length === 0 ? (
        <p style={{ color: '#6b7280' }}>
          No situation reports yet. Click &quot;Generate Now&quot; to create the first one.
        </p>
      ) : (
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBlockEnd: '0.75rem' }}>
            Historical Reports
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[...sitreps].reverse().map((sitrep) => (
              <div key={sitrep.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                border: '1px solid #e5e7eb', borderRadius: '6px',
                backgroundColor: '#fff',
                flexWrap: 'wrap', gap: '0.5rem',
              }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{sitrep.reportDate}</span>
                  <span style={{ color: '#6b7280', marginInlineStart: '1rem', fontSize: '0.875rem' }}>
                    {sitrep.totalTestsPerformed} tests · {sitrep.positiveCount} pos ({sitrep.positivityRate}%)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleExportPDF(sitrep)}
                  disabled={exporting === sitrep.id}
                  aria-label={`Export PDF for ${sitrep.reportDate}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.375rem 0.75rem', borderRadius: '4px',
                    border: '1px solid #d1d5db', backgroundColor: '#fff',
                    cursor: exporting === sitrep.id ? 'not-allowed' : 'pointer',
                    fontSize: '0.8125rem',
                  }}
                >
                  <Download size={14} aria-hidden="true" />
                  {exporting === sitrep.id ? 'Exporting…' : 'Export PDF'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label, value, valueColor, trend, large,
}: {
  label: string
  value: string | number
  valueColor?: string
  trend?: React.ReactNode
  large?: boolean
}) {
  return (
    <div style={{
      backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
      padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem',
    }}>
      <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <span style={{
          fontSize: large ? '2rem' : '1.25rem',
          fontWeight: 700,
          color: valueColor ?? '#111827',
        }}>
          {value}
        </span>
        {trend}
      </div>
    </div>
  )
}

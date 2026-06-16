'use client'

/**
 * Story 48.2 — Predictive Reagent Burndown Dashboard Card
 *
 * Displays burndown projections for all active reagents with:
 * - Summary header (total count, counts by alert level)
 * - Per-reagent rows: stock, daily rate, depletion date, expiry, reorder date, alert badge
 * - Inline SVG burndown mini-chart (120×40 px, 60-day window)
 * - Sortable by urgency, depletion date, or name
 * - RTL-aware (logical CSS properties; SVG x-axis flips for RTL)
 * - No external charting library dependency
 */

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Link from 'next/link'
import { RefreshCw, Settings, ChevronDown, ChevronUp } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { PackageSearch } from '@ultranos/ui-kit/icons'
import { useReagentBurndown } from '@/hooks/useReagentBurndown'
import type { BurndownResult } from '@/lib/reagent-burndown'
import type { AlertLevel } from '@/lib/db'

// ---------------------------------------------------------------------------
// Alert badge
// ---------------------------------------------------------------------------

function AlertBadge({ level }: { level: AlertLevel }) {
  const t = useTranslations('scheduler.burndown')
  if (level === 'none') return null

  const styles: Record<Exclude<AlertLevel, 'none'>, string> = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  }
  const labels: Record<Exclude<AlertLevel, 'none'>, string> = {
    info: t('alertInfo'),
    warning: t('alertWarning'),
    critical: t('alertCritical'),
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles[level]}`}
      data-testid={`alert-badge-${level}`}
    >
      {labels[level]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// SVG Burndown Mini-Chart (120×40 px)
// Spec: 60-day window, current stock → 0 at projected depletion
// ---------------------------------------------------------------------------

function BurndownMiniChart({
  currentStock,
  daysUntilDepletion,
  evaluationNow,
  expiryDate,
  alertLevel,
  isRtl,
}: {
  currentStock: number
  daysUntilDepletion: number
  evaluationNow: Date
  expiryDate: string | undefined
  alertLevel: AlertLevel
  isRtl: boolean
}) {
  const W = 120
  const H = 40
  const WINDOW = 60

  // Clamp stock to 0 to avoid negative-stock SVG glitches
  const stock = Math.max(0, currentStock)
  if (stock === 0) {
    return (
      <svg
        width={W}
        height={H}
        aria-hidden="true"
        role="img"
        data-testid="burndown-chart-stockout"
      >
        <line x1="0" y1={H} x2={W} y2={H} stroke="#ef4444" strokeWidth="2" />
      </svg>
    )
  }

  // P19: clamp daysUntilDepletion to [0, WINDOW] before computing SVG x positions
  // Negative values (overdue) render as x=0 (already empty), not outside the viewport.
  const clampedDays = Math.max(0, Math.min(daysUntilDepletion, WINDOW))
  const depletionX = (clampedDays / WINDOW) * W

  // Color by alert level
  const lineColor =
    alertLevel === 'critical'
      ? '#ef4444'
      : alertLevel === 'warning'
        ? '#f59e0b'
        : '#22c55e'

  const startX = isRtl ? W : 0
  const endX = isRtl ? W - depletionX : depletionX

  // P20: use evaluationNow (captured at evaluation time) for expiry marker — not live Date.now()
  const daysUntilExpiry = expiryDate
    ? Math.floor((new Date(expiryDate).getTime() - evaluationNow.getTime()) / 86400000)
    : null

  const expiryX =
    daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry < WINDOW
      ? isRtl
        ? W - (daysUntilExpiry / WINDOW) * W
        : (daysUntilExpiry / WINDOW) * W
      : null

  return (
    <svg
      width={W}
      height={H}
      aria-hidden="true"
      role="img"
      data-testid="burndown-chart"
      title={`Projected depletion: ${daysUntilDepletion} days`}
    >
      {/* Zero reference line */}
      <line
        x1="0" y1={H - 1}
        x2={W} y2={H - 1}
        stroke="#d1d5db"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      {/* Burndown line */}
      <line
        x1={startX} y1="2"
        x2={endX} y2={H - 2}
        stroke={lineColor}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Expiry marker */}
      {expiryX !== null && (
        <line
          x1={expiryX} y1="0"
          x2={expiryX} y2={H}
          stroke="#9ca3af"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Confidence indicator
// ---------------------------------------------------------------------------

function ConfidenceDot({ level }: { level: 'high' | 'medium' | 'low' }) {
  const t = useTranslations('scheduler.burndown.confidence')
  const colors = { high: 'bg-green-400', medium: 'bg-amber-400', low: 'bg-red-400' }
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[level]}`}
      title={t(level)}
      aria-label={t(level)}
    />
  )
}

// ---------------------------------------------------------------------------
// Reagent row
// P20: receives evaluationNow instead of calling Date.now() at render time
// ---------------------------------------------------------------------------

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function ReagentRow({
  item,
  evaluationNow,
  isRtl,
}: {
  item: BurndownResult
  evaluationNow: Date
  isRtl: boolean
}) {
  const t = useTranslations('scheduler.burndown')

  const stockDisplay = item.currentStock <= 0
    ? <span className="font-semibold text-red-600 uppercase text-xs">{t('stockout')}</span>
    : <span>{item.currentStock} {item.unit}</span>

  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/30">
      {/* Name + alert badge */}
      <td className="py-2 ps-3 pe-2 text-sm font-medium text-foreground">
        <div className="flex flex-col gap-1">
          <span>{item.reagentName}</span>
          {item.alertLevel !== 'none' && <AlertBadge level={item.alertLevel} />}
        </div>
      </td>

      {/* Current stock */}
      <td className="py-2 px-2 text-sm text-foreground">{stockDisplay}</td>

      {/* Daily rate + confidence */}
      <td className="py-2 px-2 text-sm text-foreground">
        <div className="flex items-center gap-1">
          <span>
            {item.consumptionRate.averageDailyUsage > 0
              ? `${item.consumptionRate.averageDailyUsage.toFixed(1)} ${item.consumptionRate.unit || item.unit}/day`
              : '—'}
          </span>
          <ConfidenceDot level={item.consumptionRate.confidenceLevel} />
        </div>
      </td>

      {/* Depletion date + reason badge */}
      <td className="py-2 px-2 text-sm text-foreground">
        <div className="flex flex-col gap-0.5">
          <span>{formatDate(item.effectiveDepletionDate.toISOString())}</span>
          <span className="text-xs text-muted-foreground">
            {t(`reason.${item.depletionReason}`)}
          </span>
        </div>
      </td>

      {/* Expiry date */}
      <td className="py-2 px-2 text-sm text-muted-foreground">{formatDate(item.expiryDate)}</td>

      {/* Reorder by */}
      <td className="py-2 px-2 text-sm font-medium text-foreground">
        {formatDate(item.reorderDate.toISOString())}
        {item.supplierName && (
          <div className="text-xs text-muted-foreground font-normal">{item.supplierName}</div>
        )}
      </td>

      {/* SVG burndown mini-chart */}
      <td className="py-2 ps-2 pe-3">
        <BurndownMiniChart
          currentStock={item.currentStock}
          daysUntilDepletion={item.daysRemaining}
          evaluationNow={evaluationNow}
          expiryDate={item.expiryDate}
          alertLevel={item.alertLevel}
          isRtl={isRtl}
        />
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortKey = 'urgency' | 'depletion' | 'name'

const alertSeverity: Record<AlertLevel, number> = {
  critical: 0, warning: 1, info: 2, none: 3,
}

function sortItems(items: BurndownResult[], key: SortKey): BurndownResult[] {
  return [...items].sort((a, b) => {
    if (key === 'urgency') {
      const diff = alertSeverity[a.alertLevel] - alertSeverity[b.alertLevel]
      return diff !== 0 ? diff : a.daysRemaining - b.daysRemaining
    }
    if (key === 'depletion') return a.daysRemaining - b.daysRemaining
    return a.reagentName.localeCompare(b.reagentName)
  })
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function ReagentBurndownCard() {
  const t = useTranslations('scheduler.burndown')
  // P11: use useLocale() — not an optional prop — so RTL detection always works
  const locale = useLocale()
  const isRtl = locale === 'ar' || locale === 'prs' || locale === 'ps'

  const { burndownData, isLoading, error, refresh } = useReagentBurndown()
  const [sortKey, setSortKey] = useState<SortKey>('urgency')
  const [showAll, setShowAll] = useState(false)

  // P20: capture evaluation time once per render cycle so chart markers stay consistent
  const evaluationNow = new Date()

  const counts = burndownData.reduce(
    (acc, r) => { acc[r.alertLevel] = (acc[r.alertLevel] ?? 0) + 1; return acc },
    {} as Record<AlertLevel, number>,
  )

  const sorted = sortItems(burndownData, sortKey)
  const displayed = showAll ? sorted : sorted.slice(0, 3)

  // P27: use EmptyState component — never ad-hoc inline markup
  if (!isLoading && burndownData.length === 0 && !error) {
    return (
      <section
        className="rounded-lg border border-border bg-card p-4"
        data-testid="burndown-card"
      >
        <EmptyState
          icon={PackageSearch}
          title={t('emptyState')}
          action={{
            label: t('emptyStateAction'),
            onClick: () => { window.location.href = `/${locale}/settings/suppliers` },
          }}
        />
      </section>
    )
  }

  return (
    <section
      className="rounded-lg border border-border bg-card overflow-hidden"
      data-testid="burndown-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          {/* Alert summary chips */}
          {(counts.critical ?? 0) > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {counts.critical} {t('alertCritical')}
            </span>
          )}
          {(counts.warning ?? 0) > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {counts.warning} {t('alertWarning')}
            </span>
          )}
          {(counts.info ?? 0) > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {counts.info} {t('alertInfo')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            aria-label={t('refresh')}
            data-testid="burndown-refresh"
          >
            <RefreshCw size={14} aria-hidden="true" />
          </Button>
          <Link
            href={`/${locale}/settings/suppliers`}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Settings size={13} aria-hidden="true" />
            {t('configureSuppliers')}
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 text-sm text-amber-700 bg-amber-50">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          <svg className="animate-spin h-4 w-4 mx-auto text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 22 6.477 22 12h-4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {/* Sort controls */}
      {!isLoading && burndownData.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 text-xs text-muted-foreground">
            <span>{t('sortBy')}</span>
            {(['urgency', 'depletion', 'name'] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  sortKey === key
                    // P10: use semantic tokens — bg-primary text-primary-foreground
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
                data-testid={`sort-${key}`}
              >
                {t(`sort.${key}`)}
              </button>
            ))}
          </div>

          {/* Reagent table */}
          <div className="overflow-x-auto">
            <table className="w-full text-start" dir={isRtl ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/50">
                  <th className="ps-3 pe-2 py-2 text-start font-medium">{t('reagentName')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('currentStock')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('dailyRate')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('depletionDate')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('expiryDate')}</th>
                  <th className="px-2 py-2 text-start font-medium">{t('reorderBy')}</th>
                  <th className="ps-2 pe-3 py-2 text-start font-medium">{t('chart')}</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((item) => (
                  <ReagentRow
                    key={item.reagentId}
                    item={item}
                    evaluationNow={evaluationNow}
                    isRtl={isRtl}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* View All / Collapse */}
          {burndownData.length > 3 && (
            <div className="border-t border-border/50 px-4 py-2">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                data-testid="toggle-all"
              >
                {showAll ? (
                  <>
                    <ChevronUp size={13} aria-hidden="true" /> {t('showLess')}
                  </>
                ) : (
                  <>
                    <ChevronDown size={13} aria-hidden="true" />
                    {t('viewAll', { count: burndownData.length })}
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

'use client'

/**
 * Story 51.6 — Technician Performance Portfolio: MetricCard component
 *
 * Reusable metric display card with professional development framing.
 * AC 2: Uses growth-oriented language, not surveillance language.
 * RTL-safe via Tailwind logical CSS utilities.
 */

import { useTranslations } from 'next-intl'
import { TrendingUp, TrendingDown, Minus } from '@ultranos/ui-kit/icons'
import type { TrendDirection } from '@/lib/portfolio-service'

interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: TrendDirection
  description?: string
  noData?: boolean
  children?: React.ReactNode
}

function TrendBadge({ trend }: { trend: TrendDirection }) {
  const t = useTranslations('portfolio')

  if (trend === 'IMPROVING') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
        <TrendingUp size={12} aria-hidden />
        {t('improving')}
      </span>
    )
  }
  if (trend === 'NEEDS_ATTENTION') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
        <TrendingDown size={12} aria-hidden />
        {t('needsAttention')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
      <Minus size={12} aria-hidden />
      {t('stable')}
    </span>
  )
}

export function MetricCard({ title, value, unit, trend, description, noData, children }: MetricCardProps) {
  const t = useTranslations('portfolio')

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col gap-3">
      <div className="text-sm font-medium text-muted-foreground">{title}</div>

      {noData ? (
        <p className="text-sm text-muted-foreground italic">{t('noData')}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tabular-nums text-foreground">
              {value}
            </span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>

          {trend && <TrendBadge trend={trend} />}
        </>
      )}

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {children}
    </div>
  )
}

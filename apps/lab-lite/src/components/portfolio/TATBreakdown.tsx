'use client'

/**
 * Story 51.6 — Technician Performance Portfolio: TATBreakdown component
 *
 * Table showing average TAT per test category (LOINC code).
 * Sorted by slowest first (most needs attention at the top).
 * RTL-safe via Tailwind logical CSS.
 */

import { useTranslations } from 'next-intl'
import { TrendingUp, TrendingDown, Minus } from '@ultranos/ui-kit/icons'
import type { TATByCategory, TrendDirection } from '@/lib/portfolio-service'

function TrendIcon({ trend }: { trend: TrendDirection }) {
  if (trend === 'IMPROVING') return <TrendingUp size={14} className="text-emerald-600" aria-hidden />
  if (trend === 'NEEDS_ATTENTION') return <TrendingDown size={14} className="text-amber-600" aria-hidden />
  return <Minus size={14} className="text-muted-foreground" aria-hidden />
}

function formatTAT(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

interface TATBreakdownProps {
  categories: TATByCategory[]
}

export function TATBreakdown({ categories }: TATBreakdownProps) {
  const t = useTranslations('portfolio')

  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground italic">{t('noData')}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label={t('averageTAT')}>
        <thead>
          <tr className="border-b border-border">
            <th className="text-start py-2 pe-4 font-medium text-muted-foreground">
              {t('testCategory')}
            </th>
            <th className="text-start py-2 pe-4 font-medium text-muted-foreground">
              {t('avgTAT')}
            </th>
            <th className="text-start py-2 pe-4 font-medium text-muted-foreground">
              {t('trend')}
            </th>
            <th className="text-end py-2 font-medium text-muted-foreground">
              {t('sampleCount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => (
            <tr key={cat.loincCode} className="border-b border-border/50 hover:bg-muted/30">
              <td className="py-2 pe-4 font-mono text-xs text-foreground">{cat.loincCode}</td>
              <td className="py-2 pe-4 font-medium tabular-nums">{formatTAT(cat.avgTatMinutes)}</td>
              <td className="py-2 pe-4">
                <TrendIcon trend={cat.trend} />
              </td>
              <td className="py-2 text-end tabular-nums text-muted-foreground">{cat.sampleCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

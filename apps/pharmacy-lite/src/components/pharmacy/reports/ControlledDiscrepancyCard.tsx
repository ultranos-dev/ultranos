'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  getControlledDiscrepancies,
  type ControlledDiscrepancy,
} from '@/lib/reports/controlled-discrepancy'

export function ControlledDiscrepancyCard() {
  const t = useTranslations('reports')
  const [discrepancies, setDiscrepancies] = useState<ControlledDiscrepancy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getControlledDiscrepancies(10)
      .then(setDiscrepancies)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {t('loadingDiscrepancies')}
        </p>
      </div>
    )
  }

  if (discrepancies.length === 0) {
    return (
      <div className="rounded-lg border border-success/20 bg-success/5 p-4">
        <h3 className="mb-1 text-sm font-medium text-success">
          {t('controlledDiscrepancies')}
        </h3>
        <p className="text-sm text-success">{t('noDiscrepancies')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <h3 className="mb-3 text-sm font-medium text-destructive">
        {t('controlledDiscrepancies')}
      </h3>
      <div className="space-y-2">
        {discrepancies.map((d) => (
          <div
            key={`${d.countId}-${d.catalogItemName}`}
            className="flex flex-wrap items-center gap-2 rounded border border-destructive/20 bg-card px-3 py-2 text-xs"
          >
            <span className="font-medium text-foreground">
              {d.catalogItemName}
            </span>
            {d.schedule && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {d.schedule}
              </span>
            )}
            <span
              className={`font-semibold tabular-nums ${d.variance < 0 ? 'text-destructive' : d.variance > 0 ? 'text-warning' : 'text-muted-foreground'}`}
            >
              {d.variance > 0 ? '+' : ''}
              {d.variance}
            </span>
            <span className="ms-auto text-muted-foreground tabular-nums">
              {new Date(d.countDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

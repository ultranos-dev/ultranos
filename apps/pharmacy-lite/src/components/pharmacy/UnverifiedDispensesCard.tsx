'use client'

import { memo } from 'react'

interface UnverifiedDispensesCardProps {
  count: number
}

export const UnverifiedDispensesCard = memo(function UnverifiedDispensesCard({
  count,
}: UnverifiedDispensesCardProps) {
  return (
    <div
      data-testid="unverified-dispenses-card"
      className="rounded-2xl border border-border bg-card p-4 shadow-card"
    >
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">
        Unverified Dispenses
      </h3>
      <div className="text-center">
        <div
          data-testid="unverified-dispenses-count"
          className={`text-2xl font-bold ${count > 0 ? 'text-warning' : 'text-foreground'}`}
        >
          {count}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Pending Review</div>
      </div>
    </div>
  )
})

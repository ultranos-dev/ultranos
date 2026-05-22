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
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-neutral-600 mb-3">
        Unverified Dispenses
      </h3>
      <div className="text-center">
        <div
          data-testid="unverified-dispenses-count"
          className={`text-2xl font-bold ${count > 0 ? 'text-amber-600' : 'text-neutral-900'}`}
        >
          {count}
        </div>
        <div className="text-xs text-neutral-500 mt-1">Pending Review</div>
      </div>
    </div>
  )
})

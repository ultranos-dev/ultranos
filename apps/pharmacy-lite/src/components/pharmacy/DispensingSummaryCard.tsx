'use client'

import { memo } from 'react'

interface DispensingSummaryCardProps {
  dispensedToday: number
  pendingSync: number
  failedSync: number
}

export const DispensingSummaryCard = memo(function DispensingSummaryCard({
  dispensedToday,
  pendingSync,
  failedSync,
}: DispensingSummaryCardProps) {
  return (
    <div data-testid="dispensing-summary-card" className="rounded-xl bg-white/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-gray-400/40">
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">Dispensed Today</h3>
      <p data-testid="dispensed-today-count" className="mt-2 text-3xl font-black text-neutral-900 tabular-nums">
        {dispensedToday}
      </p>
      <div className="mt-3 flex items-center gap-3 text-xs">
        <span className={`font-semibold tabular-nums ${pendingSync > 0 ? 'text-amber-700' : 'text-neutral-400'}`}>
          <span data-testid="pending-sync-count">{pendingSync}</span> pending
        </span>
        <span className={`font-semibold tabular-nums ${failedSync > 0 ? 'text-red-700' : 'text-neutral-400'}`}>
          <span data-testid="failed-sync-count">{failedSync}</span> failed
        </span>
      </div>
    </div>
  )
})

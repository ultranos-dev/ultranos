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
    <div data-testid="dispensing-summary-card" className="space-y-3">
      {/* Primary metric — dispensed today (largest, most prominent) */}
      <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-primary-700 uppercase tracking-wide">Dispensed Today</p>
          <p className="text-sm text-neutral-600 mt-0.5">Prescriptions fulfilled this shift</p>
        </div>
        <div data-testid="dispensed-today-count" className="text-3xl font-bold text-primary-800 tabular-nums">
          {dispensedToday}
        </div>
      </div>

      {/* Secondary metrics row */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`rounded-lg border p-3 flex items-center justify-between ${
          pendingSync > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-neutral-200 bg-white'
        }`}>
          <p className="text-xs font-medium text-neutral-600">Pending Sync</p>
          <span
            data-testid="pending-sync-count"
            className={`text-lg font-bold tabular-nums ${pendingSync > 0 ? 'text-amber-700' : 'text-neutral-400'}`}
          >
            {pendingSync}
          </span>
        </div>

        <div className={`rounded-lg border p-3 flex items-center justify-between ${
          failedSync > 0 ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-white'
        }`}>
          <p className="text-xs font-medium text-neutral-600">Failed</p>
          <span
            data-testid="failed-sync-count"
            className={`text-lg font-bold tabular-nums ${failedSync > 0 ? 'text-red-700' : 'text-neutral-400'}`}
          >
            {failedSync}
          </span>
        </div>
      </div>
    </div>
  )
})

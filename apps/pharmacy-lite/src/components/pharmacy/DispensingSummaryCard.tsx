'use client'

interface DispensingSummaryCardProps {
  dispensedToday: number
  pendingSync: number
  failedSync: number
}

export function DispensingSummaryCard({
  dispensedToday,
  pendingSync,
  failedSync,
}: DispensingSummaryCardProps) {
  return (
    <div
      data-testid="dispensing-summary-card"
      className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-neutral-600 mb-3">
        Today&apos;s Dispensing
      </h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div
            data-testid="dispensed-today-count"
            className="text-2xl font-bold text-neutral-900"
          >
            {dispensedToday}
          </div>
          <div className="text-xs text-neutral-500 mt-1">Dispensed</div>
        </div>
        <div>
          <div
            data-testid="pending-sync-count"
            className={`text-2xl font-bold ${pendingSync > 0 ? 'text-amber-600' : 'text-neutral-900'}`}
          >
            {pendingSync}
          </div>
          <div className="text-xs text-neutral-500 mt-1">Pending Sync</div>
        </div>
        <div>
          <div
            data-testid="failed-sync-count"
            className={`text-2xl font-bold ${failedSync > 0 ? 'text-red-600' : 'text-neutral-900'}`}
          >
            {failedSync}
          </div>
          <div className="text-xs text-neutral-500 mt-1">Failed Sync</div>
        </div>
      </div>
    </div>
  )
}

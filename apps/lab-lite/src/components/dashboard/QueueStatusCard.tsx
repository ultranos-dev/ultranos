'use client'

import type { QueueCounts } from '@/hooks/useDashboardData'

interface QueueStatusCardProps {
  counts: QueueCounts
}

function CountBadge({
  label,
  count,
  colorClass,
}: {
  label: string
  count: number
  colorClass: string
}) {
  return (
    <div className={`rounded-md px-3 py-2 text-center ${colorClass}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  )
}

export function QueueStatusCard({ counts }: QueueStatusCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">Upload Queue</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountBadge label="Pending" count={counts.pending} colorClass="bg-amber-50 text-amber-700" />
        <CountBadge label="Uploading" count={counts.uploading} colorClass="bg-amber-50 text-amber-700" />
        <CountBadge label="Failed" count={counts.failed} colorClass="bg-red-50 text-red-700" />
        <CountBadge label="Expired" count={counts.expired} colorClass="bg-neutral-100 text-neutral-400" />
      </div>
    </div>
  )
}

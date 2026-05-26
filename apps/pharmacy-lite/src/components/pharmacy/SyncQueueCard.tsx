'use client'

import { memo } from 'react'

interface SyncQueueCardProps {
  pendingCount: number
}

export const SyncQueueCard = memo(function SyncQueueCard({ pendingCount }: SyncQueueCardProps) {
  const isAmber = pendingCount > 0

  return (
    <div
      data-testid="sync-queue-card"
      className="rounded-xl bg-white/70 backdrop-blur-md p-5 shadow-sm ring-[0.65px] ring-gray-400/40"
    >
      <h3 className="text-sm font-black text-neutral-500 uppercase tracking-wide">
        Sync Queue
      </h3>
      <p className={`mt-2 text-3xl font-black tabular-nums ${isAmber ? 'text-amber-600' : 'text-green-600'}`}>
        {pendingCount}
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        {isAmber
          ? `${pendingCount} item${pendingCount !== 1 ? 's' : ''} awaiting sync`
          : 'All synced'}
      </p>
    </div>
  )
})

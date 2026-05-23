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
      className={`rounded-lg border p-4 shadow-sm ${
        isAmber
          ? 'border-amber-300 bg-amber-50'
          : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-600">
            Sync Queue
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            {isAmber
              ? `${pendingCount} item${pendingCount !== 1 ? 's' : ''} awaiting Hub sync`
              : 'All synced'}
          </p>
        </div>
        <div
          className={`text-2xl font-bold ${isAmber ? 'text-amber-600' : 'text-green-600'}`}
        >
          {pendingCount}
        </div>
      </div>
    </div>
  )
})

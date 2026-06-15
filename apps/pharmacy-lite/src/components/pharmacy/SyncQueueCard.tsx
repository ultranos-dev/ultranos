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
      className={`rounded-2xl border p-4 shadow-card ${
        isAmber
          ? 'border-warning/30 bg-warning/10'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">
            Sync Queue
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isAmber
              ? `${pendingCount} item${pendingCount !== 1 ? 's' : ''} awaiting Hub sync`
              : 'All synced'}
          </p>
        </div>
        <div
          className={`text-2xl font-bold ${isAmber ? 'text-warning' : 'text-success'}`}
        >
          {pendingCount}
        </div>
      </div>
    </div>
  )
})

'use client'

import { useFulfillmentStore } from '@/stores/fulfillment-store'

type PulseColor = 'green' | 'amber'

function getPulseColor(syncStatus: {
  isPending: boolean
  pendingCount: number
  lastSyncResult: { synced: boolean; queued: boolean } | null
}): PulseColor {
  if (syncStatus.isPending) return 'amber'
  if (syncStatus.lastSyncResult?.queued) return 'amber'
  return 'green'
}

function getAriaLabel(color: PulseColor, pendingCount: number): string {
  switch (color) {
    case 'green':
      return 'Sync status: all synced'
    case 'amber':
      return pendingCount > 0
        ? `Sync status: ${pendingCount} item${pendingCount !== 1 ? 's' : ''} pending`
        : 'Sync status: items queued for sync'
  }
}

const colorClasses: Record<PulseColor, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
}

const pulseClasses: Record<PulseColor, string> = {
  green: '',
  amber: 'animate-pulse',
}

export function SyncPulse() {
  const syncStatus = useFulfillmentStore((s) => s.syncStatus)
  const color = getPulseColor(syncStatus)
  const label = getAriaLabel(color, syncStatus.pendingCount)

  return (
    <div
      data-testid="sync-pulse"
      aria-label={label}
      className={`${colorClasses[color]} ${pulseClasses[color]} inline-flex items-center justify-center rounded-full h-3 w-3 relative`}
    >
      {syncStatus.isPending && syncStatus.pendingCount > 0 && (
        <span className="absolute -top-2 -end-2 text-xs font-bold text-amber-700 bg-amber-100 rounded-full h-4 w-4 flex items-center justify-center">
          {syncStatus.pendingCount}
        </span>
      )}
    </div>
  )
}

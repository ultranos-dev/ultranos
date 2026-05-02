'use client'

import { useEffect } from 'react'
import { useSyncStore } from '@/stores/sync-store'
import { db } from '@/lib/db'

/**
 * Global Sync Pulse indicator (UX-DR3).
 *
 * Shows sync status with pulsing colors:
 * - Green: all synced, no pending items
 * - Yellow: pending items exist
 * - Red: failed or conflict items exist
 *
 * Clicking opens the SyncDashboard overlay.
 */
export function SyncPulse() {
  const { pendingCount, failedCount, conflictCount, isDashboardOpen, setDashboardOpen } = useSyncStore()

  // Refresh counts from Dexie on mount and periodically to avoid stale green state
  useEffect(() => {
    const refresh = async () => {
      const store = useSyncStore.getState()
      const pending = await db.syncQueue.where('status').anyOf(['pending', 'in-flight']).count()
      const failed = await db.syncQueue.where('status').equals('failed').count()
      const conflicts = await db.syncQueue.filter(e => e.conflictFlag === true).count()
      store.updateSyncStatus({
        isPending: pending > 0,
        isError: failed > 0 || conflicts > 0,
        lastSyncedAt: store.lastSyncedAt,
        pendingCount: pending,
        failedCount: failed,
      })
      store.setConflictCount(conflicts)
    }
    refresh()
    const interval = setInterval(refresh, 10_000)
    return () => clearInterval(interval)
  }, [])

  const hasErrors = failedCount > 0 || conflictCount > 0
  const hasPending = pendingCount > 0
  const totalBadge = pendingCount + failedCount + conflictCount

  let pulseColor: string
  let ariaStatus: string

  if (hasErrors) {
    pulseColor = 'bg-red-500'
    ariaStatus = `Sync errors: ${failedCount} failed, ${conflictCount} conflicts`
  } else if (hasPending) {
    pulseColor = 'bg-yellow-500'
    ariaStatus = `${pendingCount} items pending sync`
  } else {
    pulseColor = 'bg-green-500'
    ariaStatus = 'All synced'
  }

  return (
    <button
      type="button"
      onClick={() => setDashboardOpen(!isDashboardOpen)}
      className="relative rounded-full p-2 text-neutral-600 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={`Sync status: ${ariaStatus}`}
      data-testid="sync-pulse"
    >
      {/* Pulse dot */}
      <span className="relative flex h-4 w-4">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulseColor}`}
        />
        <span
          className={`relative inline-flex h-4 w-4 rounded-full ${pulseColor}`}
          data-testid="sync-pulse-dot"
        />
      </span>

      {/* Badge count */}
      {totalBadge > 0 && (
        <span
          className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-neutral-800 px-1 text-xs font-bold text-white"
          data-testid="sync-pulse-badge"
        >
          {totalBadge > 99 ? '99+' : totalBadge}
        </span>
      )}
    </button>
  )
}

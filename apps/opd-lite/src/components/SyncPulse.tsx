'use client'

import { useEffect, useState } from 'react'
import { useSyncStore } from '@/stores/sync-store'
import { db } from '@/lib/db'
import { Button } from '@/components/ui/Button'

function formatSyncTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

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
  const { pendingCount, failedCount, conflictCount, isDashboardOpen, setDashboardOpen, lastSyncedAt } = useSyncStore()
  // Tick every 30s so "just now" → "1m ago" updates
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Refresh counts from Dexie on mount and periodically to avoid stale green state
  useEffect(() => {
    const refresh = async () => {
      const store = useSyncStore.getState()
      const pending = await db.syncQueue.where('status').anyOf(['pending', 'syncing']).count()
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
    <Button
      variant="icon"
      className="relative gap-2 rounded-lg p-2"
      onClick={() => setDashboardOpen(!isDashboardOpen)}
      aria-label={`Sync status: ${ariaStatus}`}
      data-testid="sync-pulse"
    >
      {/* Pulse dot */}
      <span className="relative flex h-4 w-4 shrink-0">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulseColor}`}
        />
        <span
          className={`relative inline-flex h-4 w-4 rounded-full ${pulseColor}`}
          data-testid="sync-pulse-dot"
        />
        {/* Badge count */}
        {totalBadge > 0 && (
          <span
            className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-100 px-0.5 text-[10px] font-bold text-neutral-900"
            data-testid="sync-pulse-badge"
          >
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </span>

      {/* Last synced timestamp */}
      <span className="text-xs text-neutral-400">
        {lastSyncedAt ? formatSyncTime(lastSyncedAt) : 'never synced'}
      </span>
    </Button>
  )
}

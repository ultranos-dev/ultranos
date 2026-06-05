'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSyncStore } from '@/stores/sync-store'
import { db } from '@/lib/db'

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
 * Global Sync Pulse indicator for Pharmacy Lite.
 *
 * Polls db.syncQueue every 10s for pending/failed counts.
 * Also reads from useSyncStore which the DrainWorker updates via onStatusUpdate.
 * Shows pulsing dot: green (all clear), amber (pending), red (failed).
 * Clicking navigates to /sync to view queue detail.
 */
export function SyncPulse() {
  const router = useRouter()
  const { pendingCount, failedCount, lastSyncedAt, updateSyncStatus } = useSyncStore()
  const [, setTick] = useState(0)

  // Tick every 30s so timestamp ages correctly
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  // Refresh counts from Dexie on mount and every 10s to avoid stale state.
  // pharmacy-lite's syncQueue uses 'in-flight' (not 'syncing') for in-progress items.
  useEffect(() => {
    const refresh = async () => {
      const pending = await db.syncQueue.where('status').anyOf(['pending', 'in-flight']).count()
      const failed = await db.syncQueue.where('status').equals('failed').count()
      updateSyncStatus({
        isPending: pending > 0,
        isError: failed > 0,
        lastSyncedAt: useSyncStore.getState().lastSyncedAt,
        pendingCount: pending,
        failedCount: failed,
      })
    }
    void refresh()
    const interval = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(interval)
  }, [updateSyncStatus])

  const hasErrors = failedCount > 0
  const hasPending = pendingCount > 0
  const totalBadge = pendingCount + failedCount

  let pulseColor: string
  let ariaStatus: string
  if (hasErrors) {
    pulseColor = 'bg-destructive'
    ariaStatus = `${failedCount} sync${failedCount !== 1 ? 's' : ''} failed`
  } else if (hasPending) {
    pulseColor = 'bg-warning'
    ariaStatus = `${pendingCount} item${pendingCount !== 1 ? 's' : ''} pending sync`
  } else {
    pulseColor = 'bg-success'
    ariaStatus = 'All synced'
  }

  return (
    <button
      type="button"
      className="relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent transition-colors"
      onClick={() => router.push('/sync')}
      aria-label={`Sync status: ${ariaStatus}`}
      data-testid="sync-pulse"
    >
      <span className="relative flex h-4 w-4 shrink-0">
        <span
          className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pulseColor}`}
        />
        <span
          className={`relative inline-flex h-4 w-4 rounded-full ${pulseColor}`}
          data-testid="sync-pulse-dot"
        />
        {totalBadge > 0 && (
          <span
            className="absolute -end-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-0.5 text-[10px] font-bold text-foreground"
            data-testid="sync-pulse-badge"
          >
            {totalBadge > 99 ? '99+' : totalBadge}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        {lastSyncedAt ? formatSyncTime(lastSyncedAt) : 'never synced'}
      </span>
    </button>
  )
}

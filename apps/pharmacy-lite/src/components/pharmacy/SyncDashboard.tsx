'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { X, RefreshCw, CircleX } from '@ultranos/ui-kit/icons'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { useSyncStore } from '@/stores/sync-store'
import { db, type SyncQueueEntry } from '@/lib/db'
import { triggerDrain } from '@/lib/sync-drain-init'

function formatTimeAgo(iso: string): string {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString()
}

function StatusBadge({ status }: { status: SyncQueueEntry['status'] }) {
  const t = useTranslations('syncDashboard')
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning">
          <span className="h-2 w-2 animate-pulse rounded-full bg-warning" />
          {t('statusPending')}
        </span>
      )
    case 'in-flight':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
          <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
          </svg>
          {t('statusSyncing')}
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
          <CircleX className="h-3.5 w-3.5" />
          {t('statusFailed')}
        </span>
      )
    case 'synced':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
          {t('statusSynced')}
        </span>
      )
  }
}

export function SyncDashboard() {
  const { isDashboardOpen, setDashboardOpen, lastSyncedAt } = useSyncStore()
  const t = useTranslations('syncDashboard')
  const [entries, setEntries] = useState<SyncQueueEntry[]>([])
  const [discardingId, setDiscardingId] = useState<string | null>(null)
  const [isDraining, setIsDraining] = useState(false)
  const [syncPhase, setSyncPhase] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    const all = await db.syncQueue.orderBy('createdAt').reverse().toArray()
    setEntries(all)
  }, [])

  useEffect(() => {
    if (!isDashboardOpen) {
      setDiscardingId(null)
      return
    }
    void loadEntries()
    const interval = setInterval(() => void loadEntries(), 2_000)
    return () => clearInterval(interval)
  }, [isDashboardOpen, loadEntries])

  const summary = useMemo(() => {
    const totalPending = entries.filter((e) => e.status === 'pending' || e.status === 'in-flight').length
    const totalFailed = entries.filter((e) => e.status === 'failed').length
    return { totalPending, totalFailed }
  }, [entries])

  const handleRetry = useCallback(
    async (entry: SyncQueueEntry) => {
      const current = await db.syncQueue.get(entry.id)
      if (!current || current.status !== 'failed') return
      await db.syncQueue.update(entry.id, { status: 'pending', lastAttemptAt: undefined })
      void loadEntries()
      triggerDrain()
    },
    [loadEntries],
  )

  const handleRetryAllFailed = useCallback(async () => {
    const failed = entries.filter((e) => e.status === 'failed')
    await Promise.all(
      failed.map((e) => db.syncQueue.update(e.id, { status: 'pending', lastAttemptAt: undefined })),
    )
    void loadEntries()
    triggerDrain()
  }, [entries, loadEntries])

  const handleDiscard = useCallback(
    async (id: string) => {
      await db.syncQueue.delete(id)
      setDiscardingId(null)
      void loadEntries()
    },
    [loadEntries],
  )

  const handleSyncNow = useCallback(async () => {
    if (!navigator.onLine || isDraining) return
    setIsDraining(true)
    setSyncPhase(t('pushingPhase'))
    try {
      triggerDrain()
      // Allow drain worker time to pick up the signal
      await new Promise((r) => setTimeout(r, 800))
      setSyncPhase(t('syncComplete'))
      const state = useSyncStore.getState()
      state.updateSyncStatus({
        isPending: state.isPending,
        isError: state.isError,
        lastSyncedAt: new Date().toISOString(),
        pendingCount: state.pendingCount,
        failedCount: state.failedCount,
      })
    } catch {
      setSyncPhase(t('syncFailedRetry'))
    } finally {
      await new Promise((r) => setTimeout(r, 600))
      setSyncPhase(null)
      setIsDraining(false)
      void loadEntries()
    }
  }, [isDraining, loadEntries, t])

  if (!isDashboardOpen) return null

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const visibleEntries = entries.filter((e) => e.status !== 'synced')
  const syncedEntries = entries.filter((e) => e.status === 'synced')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" data-testid="sync-dashboard">
      <style>{`
        @keyframes syncBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes syncPanelIn { from { opacity: 0; transform: scale(0.97) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes syncProgress { 0% { transform: translateX(-100%); } 50% { transform: translateX(0%); } 100% { transform: translateX(100%); } }
      `}</style>

      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/40 backdrop-blur-sm animate-[syncBackdropIn_100ms_ease-out_forwards]"
        onClick={() => setDashboardOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative mx-4 w-full max-w-lg overflow-hidden rounded-xl bg-background ring-[0.65px] ring-border/50 shadow-2xl animate-[syncPanelIn_200ms_ease-out_forwards]"
        role="dialog"
        aria-label={t('ariaLabel')}
      >
        {/* Header */}
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setDashboardOpen(false)}
              aria-label={t('closeAriaLabel')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Summary */}
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <span className="rounded-md bg-warning/10 px-2 py-1 font-medium text-warning">
              {summary.totalPending} {t('pending')}
            </span>
            <span className="rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
              {summary.totalFailed} {t('failed')}
            </span>
            {lastSyncedAt && (
              <span className="rounded-md bg-success/10 px-2 py-1 text-success">
                {t('lastSync', { time: formatTimeAgo(lastSyncedAt) })}
              </span>
            )}
          </div>

          {/* Sync progress */}
          {isDraining && syncPhase && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    syncPhase === t('syncComplete') ? 'w-full bg-success' : 'bg-primary animate-[syncProgress_1.5s_ease-in-out_infinite]'
                  }`}
                  style={syncPhase !== t('syncComplete') ? { width: '70%' } : undefined}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{syncPhase}</p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              type="button"
              onClick={handleSyncNow}
              disabled={!isOnline || isDraining}
              title={!isOnline ? t('noNetworkConnection') : undefined}
              data-testid="sync-now-btn"
            >
              {isDraining ? (
                <svg className="h-3.5 w-3.5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {isDraining ? t('syncing') : t('syncNow')}
            </Button>
            {summary.totalFailed > 1 && (
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={handleRetryAllFailed}
                data-testid="retry-all-btn"
              >
                {t('retryAllFailed')}
              </Button>
            )}
          </div>
        </div>

        {/* Queue items */}
        <div className="max-h-[60vh] overflow-y-auto" data-testid="sync-item-list">
          {visibleEntries.length === 0 && syncedEntries.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              {t('allSynced')}
            </div>
          ) : (
            <>
              {visibleEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0"
                  data-testid="sync-item"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      {entry.resourceType} — ID {entry.resourceId.slice(0, 8)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.status} />
                      <span className="text-xs text-muted-foreground">{formatTimeAgo(entry.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {entry.status === 'failed' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          type="button"
                          onClick={() => handleRetry(entry)}
                          data-testid="retry-btn"
                        >
                          {t('retry')}
                        </Button>
                        {discardingId === entry.id ? (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              type="button"
                              onClick={() => handleDiscard(entry.id)}
                              data-testid="confirm-discard-btn"
                            >
                              {t('confirm')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              onClick={() => setDiscardingId(null)}
                            >
                              {t('cancel')}
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => setDiscardingId(entry.id)}
                            data-testid="discard-btn"
                          >
                            {t('discard')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              {visibleEntries.length === 0 && syncedEntries.length > 0 && (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t('allSynced')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { RefreshCw } from '@ultranos/ui-kit/icons'
import { db, type SyncQueueEntry as SyncQueueEntryType } from '@/lib/db'
import { SyncQueueEntry } from './SyncQueueEntry'
import { syncDispenseToHub } from '@/lib/dispense-sync'

const CLEANUP_THRESHOLD_MS = 24 * 60 * 60 * 1000
const MAX_RETRY_COUNT = 10

interface CategorizedEntries {
  pending: SyncQueueEntryType[]
  inFlight: SyncQueueEntryType[]
  failed: SyncQueueEntryType[]
  synced: SyncQueueEntryType[]
}

function categorize(entries: SyncQueueEntryType[]): CategorizedEntries {
  const result: CategorizedEntries = {
    pending: [],
    inFlight: [],
    failed: [],
    synced: [],
  }

  for (const entry of entries) {
    switch (entry.status) {
      case 'pending':
        result.pending.push(entry)
        break
      case 'in-flight':
        result.inFlight.push(entry)
        break
      case 'failed':
        result.failed.push(entry)
        break
      case 'synced':
        result.synced.push(entry)
        break
    }
  }

  return result
}

async function cleanupOldSynced(): Promise<void> {
  const cutoff = new Date(Date.now() - CLEANUP_THRESHOLD_MS).toISOString()
  const syncedEntries = await db.syncQueue
    .where('status')
    .equals('synced')
    .toArray()

  const toDelete = syncedEntries.filter((e) => {
    // Only use lastAttemptAt for synced entries — createdAt reflects enqueue time, not sync time
    if (!e.lastAttemptAt) return false
    return e.lastAttemptAt < cutoff
  })

  if (toDelete.length > 0) {
    await db.syncQueue.bulkDelete(toDelete.map((e) => e.id))
  }
}

export function SyncQueueDashboard() {
  const t = useTranslations('sync')
  const [entries, setEntries] = useState<CategorizedEntries>({
    pending: [],
    inFlight: [],
    failed: [],
    synced: [],
  })
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  const [retryAllInProgress, setRetryAllInProgress] = useState(false)
  const [retryProgress, setRetryProgress] = useState<string | null>(null)

  const loadEntries = useCallback(async () => {
    const all = await db.syncQueue.toArray()
    setEntries(categorize(all))
  }, [])

  useEffect(() => {
    async function init() {
      await cleanupOldSynced()
      await loadEntries()
    }
    init()
  }, [loadEntries])

  const handleRetry = useCallback(
    async (entry: SyncQueueEntryType) => {
      // Status guard: re-read from DB and bail if no longer failed
      const current = await db.syncQueue.get(entry.id)
      if (!current || current.status !== 'failed') return

      // Mutual exclusion: mark in-flight before network call
      await db.syncQueue.update(entry.id, { status: 'in-flight', lastAttemptAt: new Date().toISOString() })
      setRetryingIds((prev) => new Set(prev).add(entry.id))

      try {
        const dispense = await db.dispenses.get(entry.resourceId)

        if (dispense) {
          const result = await syncDispenseToHub(dispense)
          if (result.synced) {
            await db.syncQueue.update(entry.id, { status: 'synced', lastAttemptAt: new Date().toISOString() })
          } else {
            await db.syncQueue.update(entry.id, {
              status: 'failed',
              retryCount: Math.min(current.retryCount + 1, MAX_RETRY_COUNT),
              lastAttemptAt: new Date().toISOString(),
            })
          }
        } else {
          // The local dispense record is gone. The stored payload may be encrypted
          // (enc:v1:), so JSON.parse-ing it here throws and force-fails the entry.
          // Hand it back to the DrainWorker (30s poll), which decrypts before pushing.
          await db.syncQueue.update(entry.id, {
            status: 'pending',
            retryCount: 0,
            lastAttemptAt: new Date().toISOString(),
          })
        }
      } catch {
        await db.syncQueue.update(entry.id, {
          status: 'failed',
          retryCount: Math.min(current.retryCount + 1, MAX_RETRY_COUNT),
          lastAttemptAt: new Date().toISOString(),
        })
      } finally {
        setRetryingIds((prev) => {
          const next = new Set(prev)
          next.delete(entry.id)
          return next
        })
        await loadEntries()
      }
    },
    [loadEntries],
  )

  const handleRetryAllFailed = useCallback(async () => {
    setRetryAllInProgress(true)
    const failedIds = entries.failed.map((e) => e.id)

    for (let i = 0; i < failedIds.length; i++) {
      setRetryProgress(t('retryingProgress', { current: i + 1, total: failedIds.length }))
      // Re-read from DB to avoid stale snapshot issues
      const fresh = await db.syncQueue.get(failedIds[i]!)
      if (fresh && fresh.status === 'failed') {
        await handleRetry(fresh)
      }
    }

    setRetryProgress(null)
    setRetryAllInProgress(false)
    await loadEntries()
  }, [entries.failed, handleRetry, loadEntries])

  const handleReset = useCallback(
    async (entry: SyncQueueEntryType) => {
      await db.syncQueue.update(entry.id, {
        status: 'pending' as const,
        lastAttemptAt: undefined,
      })
      await loadEntries()
    },
    [loadEntries],
  )

  const totalCount =
    entries.pending.length +
    entries.inFlight.length +
    entries.failed.length +
    entries.synced.length

  const isRetrying = retryingIds.size > 0 || retryAllInProgress

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('syncQueue')}</h1>

      {totalCount === 0 && (
        <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <EmptyState icon={RefreshCw} title={t('noItems')} />
        </div>
      )}

      {entries.failed.length > 0 && (
        <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-destructive">
              {t('failedCount', { count: entries.failed.length })}
            </h2>
            {entries.failed.length > 1 && (
              <Button
                variant="destructive"
                type="button"
                aria-label={t('retryAllFailedAriaLabel')}
                disabled={isRetrying}
                onClick={handleRetryAllFailed}
              >
                {retryProgress ?? t('retryAllFailed')}
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {entries.failed.map((entry) => (
              <SyncQueueEntry
                key={entry.id}
                entry={entry}
                onRetry={handleRetry}
                onReset={handleReset}
                retrying={isRetrying || retryingIds.has(entry.id)}
              />
            ))}
          </div>
        </section>
      )}

      {entries.inFlight.length > 0 && (
        <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <h2 className="text-sm font-semibold text-primary mb-2">
            {t('inFlightCount', { count: entries.inFlight.length })}
          </h2>
          <div className="flex flex-col gap-2">
            {entries.inFlight.map((entry) => (
              <SyncQueueEntry
                key={entry.id}
                entry={entry}
                onReset={handleReset}
              />
            ))}
          </div>
        </section>
      )}

      {entries.pending.length > 0 && (
        <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <h2 className="text-sm font-semibold text-warning mb-2">
            {t('pendingCount', { count: entries.pending.length })}
          </h2>
          <div className="flex flex-col gap-2">
            {entries.pending.map((entry) => (
              <SyncQueueEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {entries.synced.length > 0 && (
        <section className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
          <h2 className="text-sm font-semibold text-success mb-2">
            {t('recentlySynced', { count: entries.synced.length })}
          </h2>
          <div className="flex flex-col gap-2">
            {entries.synced.map((entry) => (
              <SyncQueueEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

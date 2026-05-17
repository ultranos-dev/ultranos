'use client'

import { useEffect, useState, useCallback } from 'react'
import { db, type SyncQueueEntry as SyncQueueEntryType } from '@/lib/db'
import { SyncQueueEntry } from './SyncQueueEntry'
import { syncDispenseToHub, retrySyncPayload } from '@/lib/dispense-sync'

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
          // No dispense record — retry with stored payload via consolidated helper
          const payload = JSON.parse(current.payload)
          const result = await retrySyncPayload(payload)

          if (result.synced) {
            await db.syncQueue.update(entry.id, { status: 'synced', lastAttemptAt: new Date().toISOString() })
          } else {
            await db.syncQueue.update(entry.id, {
              status: 'failed',
              retryCount: Math.min(current.retryCount + 1, MAX_RETRY_COUNT),
              lastAttemptAt: new Date().toISOString(),
            })
          }
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
      setRetryProgress(`Retrying ${i + 1} of ${failedIds.length}...`)
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
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-lg font-semibold text-neutral-900">Sync Queue</h1>

      {totalCount === 0 && (
        <p className="text-sm text-neutral-500">No items in the sync queue.</p>
      )}

      {entries.failed.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-red-700">
              Failed ({entries.failed.length})
            </h2>
            {entries.failed.length > 1 && (
              <button
                type="button"
                aria-label="Retry All Failed"
                disabled={isRetrying}
                onClick={handleRetryAllFailed}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retryProgress ?? 'Retry All Failed'}
              </button>
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
        <section>
          <h2 className="text-sm font-semibold text-blue-700 mb-2">
            In-Flight ({entries.inFlight.length})
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
        <section>
          <h2 className="text-sm font-semibold text-amber-700 mb-2">
            Pending ({entries.pending.length})
          </h2>
          <div className="flex flex-col gap-2">
            {entries.pending.map((entry) => (
              <SyncQueueEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      )}

      {entries.synced.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-green-700 mb-2">
            Recently Synced ({entries.synced.length})
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

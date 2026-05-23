'use client'

import { useEffect } from 'react'
import { db } from '@/lib/db'

const SYNC_TAG = 'ultranos-sync-queue'
const PERIODIC_TAG = 'ultranos-periodic-sync'

/**
 * Registers the Background Sync API so the service worker can trigger
 * a sync drain when connectivity is restored — even if the tab is inactive.
 *
 * Also listens for ULTRANOS_SYNC_TRIGGER messages from the service worker
 * and dispatches the existing 'ultranos:sync-now' custom event that the
 * sync drain worker already listens to.
 */
export function useBackgroundSync() {
  useEffect(() => {
    // Listen for SW → client sync trigger messages
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'ULTRANOS_SYNC_TRIGGER') {
        window.dispatchEvent(new CustomEvent('ultranos:sync-now'))
      }
    }
    navigator.serviceWorker?.addEventListener('message', handleMessage)

    // Register one-shot Background Sync when items are pending
    async function registerSyncIfNeeded() {
      try {
        const pending = await db.syncQueue
          .where('status')
          .anyOf(['pending', 'failed'])
          .count()
        if (pending > 0 && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready
          if ('sync' in reg) {
            await (reg as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG)
          }
        }
      } catch {
        // Background Sync not supported — polling continues as fallback
      }
    }

    // Register Periodic Background Sync (requires permission grant)
    async function registerPeriodicSync() {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.ready
          const periodicSync = (reg as ServiceWorkerRegistration & { periodicSync?: { register: (tag: string, opts: { minInterval: number }) => Promise<void> } }).periodicSync
          if (periodicSync) {
            await periodicSync.register(PERIODIC_TAG, {
              minInterval: 5 * 60 * 1000, // 5 minutes minimum
            })
          }
        }
      } catch {
        // Periodic sync not supported or permission denied — polling fallback
      }
    }

    registerSyncIfNeeded()
    registerPeriodicSync()

    // Re-register one-shot sync whenever items are added to the queue
    const interval = setInterval(registerSyncIfNeeded, 30_000)

    return () => {
      clearInterval(interval)
      navigator.serviceWorker?.removeEventListener('message', handleMessage)
    }
  }, [])
}

'use client'

import { useEffect, useRef } from 'react'
import '@/lib/key-lifecycle-hooks' // registers re-auth listener for awaiting-key queue restoration
import { startSyncWorker, stopSyncWorker, triggerDrain } from '@/lib/sync-worker'
import { pullPatientChanges } from '@/lib/sync-pull'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { db } from '@/lib/db'
import type { SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'

const HUB_BASE_URL = (process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3004').replace(/\/api\/trpc\/?$/, '')

/** Background pull interval — 2 minutes */
const BACKGROUND_PULL_INTERVAL_MS = 2 * 60 * 1000

let cachedToken = ''

async function refreshToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  cachedToken = data.session?.access_token ?? ''
  return cachedToken
}

/** Mark a successful sync check in both the store and Dexie. */
function markSynced() {
  const state = useSyncStore.getState()
  state.updateSyncStatus({
    isPending: state.isPending,
    isError: state.isError,
    lastSyncedAt: new Date().toISOString(),
    pendingCount: state.pendingCount,
    failedCount: state.failedCount,
  })
}

/** Pull for the active patient if a chart is open. */
async function backgroundPull() {
  if (!navigator.onLine) return
  const activePatientId = useSyncStore.getState().activePatientId
  if (!activePatientId) return

  try {
    await refreshToken()
    if (!cachedToken) return
    await pullPatientChanges(activePatientId, () => cachedToken)
    markSynced()
  } catch {
    // Silent — background pull failure is non-critical
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const updateSyncStatus = useSyncStore((s) => s.updateSyncStatus)
  const setConflictCount = useSyncStore((s) => s.setConflictCount)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      if (startedRef.current) {
        stopSyncWorker()
        startedRef.current = false
        cachedToken = ''
      }
      return
    }

    if (startedRef.current) return
    startedRef.current = true

    // Hydrate lastSyncedAt from Dexie so the banner reflects persisted state
    db.syncMeta.get('__global__').then((global) => {
      if (global?.lastPulledAt) {
        const state = useSyncStore.getState()
        state.updateSyncStatus({
          isPending: state.isPending,
          isError: state.isError,
          lastSyncedAt: global.lastPulledAt,
          pendingCount: state.pendingCount,
          failedCount: state.failedCount,
        })
      }
    }).catch(() => {})

    // Start the push drain worker
    refreshToken().then(() => {
      startSyncWorker({
        hubBaseUrl: HUB_BASE_URL,
        getAuthToken: () => cachedToken,
        onStatusUpdate: updateSyncStatus,
        onConflict: async (entry: SyncQueueEntry, resolution: ConflictResolution) => {
          await db.syncQueue.update(entry.id, {
            conflictFlag: true,
            conflictData: JSON.stringify(resolution.kept.find((r) => r.id !== entry.resourceId)?.data ?? {}),
            status: 'failed' as const,
          })
          const conflicts = await db.syncQueue
            .filter((e) => e.conflictFlag === true && e.status !== 'synced')
            .count()
          setConflictCount(conflicts)
        },
      })

      // Mark synced on initial startup when online — the worker is running
      // and will push any pending changes, so the app is in a "synced" state
      if (navigator.onLine) {
        markSynced()
      }
    })

    // Refresh token every 10 minutes (JWT has 15-min expiry)
    const tokenInterval = setInterval(() => { refreshToken() }, 10 * 60 * 1000)

    // Background pull every 2 minutes for the active patient
    const pullInterval = setInterval(backgroundPull, BACKGROUND_PULL_INTERVAL_MS)

    // Listen for service worker sync trigger
    function handleSyncNow() {
      triggerDrain()
    }
    window.addEventListener('ultranos:sync-now', handleSyncNow)

    // On reconnect: push drain + pull active patient
    function handleOnline() {
      triggerDrain()
      backgroundPull()
      markSynced()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      clearInterval(tokenInterval)
      clearInterval(pullInterval)
      window.removeEventListener('ultranos:sync-now', handleSyncNow)
      window.removeEventListener('online', handleOnline)
      stopSyncWorker()
      startedRef.current = false
      cachedToken = ''
    }
  }, [isAuthenticated, updateSyncStatus, setConflictCount])

  return <>{children}</>
}

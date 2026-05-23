'use client'

import { useEffect, useRef } from 'react'
import { startSyncWorker, stopSyncWorker, triggerDrain } from '@/lib/sync-worker'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { db } from '@/lib/db'
import type { SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'

const HUB_BASE_URL = process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000'

/**
 * Cached auth token — updated before each sync cycle.
 * getAuthToken() is called synchronously inside the async syncFn,
 * so we cache the token from the async Supabase session.
 */
let cachedToken = ''

async function refreshToken(): Promise<string> {
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  cachedToken = data.session?.access_token ?? ''
  return cachedToken
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const updateSyncStatus = useSyncStore((s) => s.updateSyncStatus)
  const setConflictCount = useSyncStore((s) => s.setConflictCount)
  const startedRef = useRef(false)

  useEffect(() => {
    console.log('[SyncProvider] effect fired, isAuthenticated=', isAuthenticated, 'startedRef=', startedRef.current)
    if (!isAuthenticated) {
      if (startedRef.current) {
        console.log('[SyncProvider] stopping worker (logged out)')
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
    }).catch(() => { /* Dexie not ready yet — will hydrate on next cycle */ })

    // Seed the token cache before starting the worker
    console.log('[SyncProvider] refreshing token and starting worker...')
    refreshToken().then(() => {
      console.log('[SyncProvider] token refreshed, cachedToken present=', !!cachedToken, ', starting worker')
      startSyncWorker({
        hubBaseUrl: HUB_BASE_URL,
        getAuthToken: () => cachedToken,
        onStatusUpdate: updateSyncStatus,
        onConflict: async (entry: SyncQueueEntry, resolution: ConflictResolution) => {
          // Persist conflict data to the syncQueue entry for later review
          await db.syncQueue.update(entry.id, {
            conflictFlag: true,
            conflictData: JSON.stringify(resolution.kept.find((r) => r.id !== entry.resourceId)?.data ?? {}),
            status: 'failed' as const,
          })

          // Update global conflict count
          const conflicts = await db.syncQueue
            .filter((e) => e.conflictFlag === true && e.status !== 'resolved')
            .count()
          setConflictCount(conflicts)
        },
      })
    })

    // Refresh token every 10 minutes (JWT has 15-min expiry)
    const tokenInterval = setInterval(() => { refreshToken() }, 10 * 60 * 1000)

    // Listen for service worker sync trigger
    function handleSyncNow() {
      triggerDrain()
    }
    window.addEventListener('ultranos:sync-now', handleSyncNow)

    return () => {
      clearInterval(tokenInterval)
      window.removeEventListener('ultranos:sync-now', handleSyncNow)
      stopSyncWorker()
      startedRef.current = false
      cachedToken = ''
    }
  }, [isAuthenticated, updateSyncStatus, setConflictCount])

  return <>{children}</>
}

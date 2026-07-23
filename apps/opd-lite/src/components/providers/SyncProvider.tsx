'use client'

import { useEffect, useRef } from 'react'
import '@/lib/key-lifecycle-hooks' // registers re-auth listener for awaiting-key queue restoration
import { startSyncWorker, stopSyncWorker, triggerDrain } from '@/lib/sync-worker'
import { syncDrugCatalog } from '@/lib/drug-catalog-sync'
import { pullPatientChanges, pullPractitionerEncounters } from '@/lib/sync-pull'
import { syncAllPatientsToDb } from '@/lib/use-patient-list-sync'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getHubBaseUrl } from '@/lib/hub-url'
import { db } from '@/lib/db'
import type { SyncQueueEntry, ConflictResolution } from '@ultranos/sync-engine'

const HUB_BASE_URL = getHubBaseUrl()

/** Fire-and-forget enriched-catalog sync on sign-in (online-gated/throttled inside). */
export async function triggerCatalogSyncOnAuth(isAuthenticated: boolean): Promise<void> {
  if (!isAuthenticated) return
  await syncDrugCatalog()
}

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

/** Minimum spacing between full patient-directory refreshes when no chart is open. */
const DIRECTORY_HEARTBEAT_MS = 5 * 60 * 1000
let lastDirectoryHeartbeat = 0

/**
 * Periodic freshness pull. Keeps lastSyncedAt honest while the app sits open, so
 * the stale-data banner reflects real connectivity rather than idle time:
 *  - Chart open → pull that patient's changes (2-min cadence).
 *  - No chart open → refresh the patient directory, throttled to
 *    DIRECTORY_HEARTBEAT_MS (patient.list has no incremental cursor, so we avoid
 *    re-pulling the whole directory every tick).
 * markSynced() runs ONLY after a pull actually succeeds — never cosmetically, so
 * "synced N min ago" always reflects a real Hub round-trip.
 */
async function backgroundPull() {
  if (!navigator.onLine) return

  const { setSyncError } = useSyncStore.getState()
  try {
    await refreshToken()
    if (!cachedToken) return

    const activePatientId = useSyncStore.getState().activePatientId
    if (activePatientId) {
      const r = await pullPatientChanges(activePatientId, () => cachedToken)
      // Only mark synced on a genuine round-trip. If the pull reported an error
      // while we are online, surface it — the banner suppresses elapsed-time
      // staleness when online, so a silent failure would otherwise hide a
      // Hub-unreachable state (a false "you're in sync").
      if (r.errors.length > 0) {
        if (navigator.onLine) setSyncError('HUB_REFRESH_FAILED')
        return
      }
      setSyncError(null)
      markSynced()
      return
    }

    const now = Date.now()
    if (now - lastDirectoryHeartbeat < DIRECTORY_HEARTBEAT_MS) return
    lastDirectoryHeartbeat = now
    // rethrow so an unreachable Hub is observable (syncAllPatientsToDb otherwise
    // swallows and returns a partial list, which would falsely mark us synced).
    await syncAllPatientsToDb(undefined, { rethrow: true })
    setSyncError(null)
    markSynced()
  } catch {
    // We were online yet the refresh failed — surface it rather than silently
    // marking synced. A transient blip clears on the next successful heartbeat.
    if (navigator.onLine) setSyncError('HUB_REFRESH_FAILED')
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

    // Phase 1: refresh the enriched drug-catalog mirror on sign-in (best-effort).
    void triggerCatalogSyncOnAuth(true)

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

      // Initial login pull: refresh the local patient directory AND all of the
      // clinician's active-status encounters (paged fully) so the dashboard and
      // lists aren't stale on sign-in (previously nothing pulled until you opened
      // a chart/directory). Online-gated and best-effort — offline keeps cache.
      if (navigator.onLine && cachedToken) {
        void syncAllPatientsToDb()
        void pullPractitionerEncounters(() => cachedToken).then((r) => {
          const store = useSyncStore.getState()
          if (r.errors.length > 0) {
            // Surface WHY the encounter pull could not complete (e.g. KYC_REQUIRED
            // when the org is pending verification, or a network error) instead of
            // failing silently and leaving the dashboard mysteriously empty. Push
            // (drain) is independent and unaffected.
            store.setSyncError(r.errors[0]!)
          } else {
            store.setSyncError(null)
            if (r.changesApplied > 0) markSynced()
          }
        })
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

    // Drain immediately when the user returns to the app, instead of waiting up
    // to the 30s poll. Covers the common "tab was backgrounded / app refocused"
    // case — the in-page worker can only run while a tab is open, so the moment
    // it becomes active we flush any queued changes.
    function handleResume() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (!navigator.onLine) return
      triggerDrain()
      backgroundPull()
    }
    document.addEventListener('visibilitychange', handleResume)
    window.addEventListener('focus', handleResume)

    return () => {
      clearInterval(tokenInterval)
      clearInterval(pullInterval)
      window.removeEventListener('ultranos:sync-now', handleSyncNow)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleResume)
      window.removeEventListener('focus', handleResume)
      stopSyncWorker()
      startedRef.current = false
      cachedToken = ''
    }
  }, [isAuthenticated, updateSyncStatus, setConflictCount])

  return <>{children}</>
}

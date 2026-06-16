'use client'

import { useEffect, useRef } from 'react'
import '@/lib/key-lifecycle-hooks'
import { startSyncDrain, stopSyncDrain, triggerDrain } from '@/lib/sync-drain-init'
import { startKrlSync, stopKrlSync } from '@/lib/krl-sync-worker'
import { startAuditDrain, stopAuditDrain } from '@/lib/audit'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getHubApiUrl } from '@/lib/trpc'

/**
 * SyncProvider — centralized sync lifecycle management for Pharmacy Lite.
 *
 * Mirrors OPD-Lite's SyncProvider pattern:
 * - Starts sync drain worker, KRL sync, and audit drain on auth
 * - Stops all workers on logout / session expiry
 * - Listens for `online` events to trigger immediate drain
 * - Listens for `ultranos:sync-now` events (service worker / manual trigger)
 * - Refreshes auth token on a 10-min interval (JWT has 15-min expiry)
 *
 * Pharmacy-specific differences from OPD-Lite:
 * - No background pull interval (pharmacy is push-dominant; prescriptions arrive via QR scan)
 * - KRL sync worker started here (OPD-Lite doesn't have KRL)
 * - Audit drain also managed here for consistent lifecycle
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      if (startedRef.current) {
        stopSyncDrain()
        stopKrlSync()
        stopAuditDrain()
        startedRef.current = false
      }
      return
    }

    if (startedRef.current) return
    startedRef.current = true

    const hubBaseUrl = getHubApiUrl()
    const session = useAuthSessionStore.getState().session

    // Start sync drain worker (pushes queued MedicationDispense entries to Hub)
    startSyncDrain()

    // Start KRL sync worker (polls Hub for key revocation list every 5 min)
    if (session) {
      startKrlSync(
        () => useAuthSessionStore.getState().getAccessToken(),
        session.practitionerId,
      )
    }

    // Start audit drain worker (syncs client audit events to Hub)
    startAuditDrain(hubBaseUrl)

    // Mark synced on initial startup when online
    if (navigator.onLine) {
      useSyncStore.getState().markSynced()
    }

    // Refresh token every 10 minutes (JWT has 15-min expiry)
    const tokenInterval = setInterval(() => {
      void useAuthSessionStore.getState().getAccessToken()
    }, 10 * 60 * 1000)

    // Listen for service worker sync trigger
    function handleSyncNow() {
      triggerDrain()
    }
    window.addEventListener('ultranos:sync-now', handleSyncNow)

    // On reconnect: trigger immediate drain and mark synced
    function handleOnline() {
      triggerDrain()
      useSyncStore.getState().markSynced()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      clearInterval(tokenInterval)
      window.removeEventListener('ultranos:sync-now', handleSyncNow)
      window.removeEventListener('online', handleOnline)
      stopSyncDrain()
      stopKrlSync()
      stopAuditDrain()
      startedRef.current = false
    }
  }, [isAuthenticated])

  return <>{children}</>
}

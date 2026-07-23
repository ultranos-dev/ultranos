'use client'

import '@/lib/key-lifecycle-hooks'
import { useEffect, useRef } from 'react'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useSyncStore } from '@/stores/sync-store'
import { startUploadDrain, stopUploadDrain, triggerUploadDrain } from '@/lib/upload-drain-init'
import { startAuditDrain, stopAuditDrain } from '@/lib/audit-client'
import { uploadResult } from '@/lib/trpc'
import { reportQueueAuditEvent } from '@/lib/queue-audit'
import { getSupabaseBrowserClient } from '@/lib/supabase'

/**
 * SyncProvider — centralized sync lifecycle management for Lab Lite.
 *
 * - Starts upload queue drain + audit drain on authentication
 * - Stops all workers on logout / session expiry
 * - Listens for `online` events to trigger immediate drain
 * - Refreshes auth token on a 10-min interval (JWT has 15-min expiry)
 *
 * Lab Lite differences from OPD-Lite:
 * - Push-only (upload result files, no pull)
 * - No conflict resolution (lab results are write-once)
 * - Upload queue uses `uploadResult` tRPC fn, not sync.push
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated) {
      if (startedRef.current) {
        stopUploadDrain()
        stopAuditDrain()
        startedRef.current = false
      }
      return
    }

    if (startedRef.current) return
    startedRef.current = true

    async function getToken(): Promise<string> {
      const { data } = await getSupabaseBrowserClient().auth.getSession()
      return data.session?.access_token ?? ''
    }

    // Start upload queue drain
    startUploadDrain({
      uploadFn: uploadResult,
      getToken,
      onSyncError: (reason) => {
        useSyncStore.getState().setSyncError(reason)
      },
      onAuditEvent: (event) => {
        void getToken().then((token) =>
          reportQueueAuditEvent(
            {
              action: event.action,
              queueEntryId: event.queueEntryId,
              testCategory: event.testCategory,
              patientRef: event.patientRef,
              timestamp: event.timestamp,
            },
            token,
          ),
        )
      },
    })

    // Start audit drain (AuditDrainInit component was never mounted, absorb it here)
    startAuditDrain()

    // Mark synced on initial startup when online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const state = useSyncStore.getState()
      state.updateSyncStatus({
        isPending: state.isPending,
        isError: state.isError,
        lastSyncedAt: new Date().toISOString(),
        pendingCount: state.pendingCount,
        failedCount: state.failedCount,
      })
    }

    // Refresh token every 10 minutes (JWT has 15-min expiry)
    const tokenInterval = setInterval(() => void getToken(), 10 * 60 * 1000)

    // Background drain every 30 seconds while online — ensures newly queued
    // items drain automatically without waiting for a reconnect event.
    const drainInterval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        triggerUploadDrain()
      }
    }, 30_000)

    // On reconnect: trigger immediate drain
    function handleOnline() {
      triggerUploadDrain()
    }
    window.addEventListener('online', handleOnline)

    return () => {
      clearInterval(tokenInterval)
      clearInterval(drainInterval)
      window.removeEventListener('online', handleOnline)
      stopUploadDrain()
      stopAuditDrain()
      startedRef.current = false
    }
  }, [isAuthenticated])

  return <>{children}</>
}

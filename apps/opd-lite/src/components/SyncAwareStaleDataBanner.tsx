'use client'

import { useEffect, useState } from 'react'
import { StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { triggerDrain } from '@/lib/sync-worker'
import { pullPatientChanges } from '@/lib/sync-pull'

/** Turn a raw pull-error reason into a human-facing sentence. */
function describeSyncError(reason: string): string {
  if (reason.includes('KYC_REQUIRED')) {
    return 'Encounters are unavailable because your organization is pending verification. Clinical data unlocks once KYC is approved.'
  }
  if (reason.includes('SUBSCRIPTION_REQUIRED')) {
    return 'Encounters are unavailable — this organization does not have an active OPD Lite subscription.'
  }
  if (reason.includes('ORG_SUSPENDED')) {
    return 'Encounters are unavailable — organization access is suspended.'
  }
  if (reason.includes('HUB_REFRESH_FAILED')) {
    return 'Couldn’t reach the Hub to refresh data — showing the last synced copy. It may be temporarily unreachable.'
  }
  return `Couldn’t refresh encounters (${reason}). Push and the patient directory are unaffected.`
}

export function SyncAwareStaleDataBanner() {
  const [mounted, setMounted] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const failedCount = useSyncStore((s) => s.failedCount)
  const syncError = useSyncStore((s) => s.syncError)

  useEffect(() => {
    setMounted(true)
    // Seed + track live connectivity so the banner only warns about elapsed-time
    // staleness when actually offline (an online app refreshes on demand).
    setIsOnline(navigator.onLine)
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!mounted || !isAuthenticated) return null

  return (
    <>
      {syncError && (
        <div
          role="status"
          className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {describeSyncError(syncError)}
        </div>
      )}
      <StaleDataBanner
      lastSyncedAt={lastSyncedAt}
      failedCount={failedCount}
      isOnline={isOnline}
      onSyncNow={async () => {
        await triggerDrain()

        const activePatientId = useSyncStore.getState().activePatientId
        if (activePatientId) {
          try {
            const { getSupabaseBrowserClient } = await import('@/lib/supabase')
            const { data } = await getSupabaseBrowserClient().auth.getSession()
            const token = data.session?.access_token ?? ''
            if (token) {
              await pullPatientChanges(activePatientId, () => token)
            }
          } catch {
            // Pull failed — push still completed
          }
        }

        const state = useSyncStore.getState()
        state.updateSyncStatus({
          isPending: state.isPending,
          isError: state.isError,
          lastSyncedAt: new Date().toISOString(),
          pendingCount: state.pendingCount,
          failedCount: state.failedCount,
        })
      }}
      />
    </>
  )
}
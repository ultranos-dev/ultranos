'use client'

import { useEffect, useState } from 'react'
import { StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { triggerDrain } from '@/lib/sync-worker'
import { pullPatientChanges } from '@/lib/sync-pull'

export function SyncAwareStaleDataBanner() {
  const [mounted, setMounted] = useState(false)
  const isAuthenticated = useAuthSessionStore((s) => s.isAuthenticated)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const failedCount = useSyncStore((s) => s.failedCount)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !isAuthenticated) return null

  return (
    <StaleDataBanner
      lastSyncedAt={lastSyncedAt}
      failedCount={failedCount}
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
  )
}
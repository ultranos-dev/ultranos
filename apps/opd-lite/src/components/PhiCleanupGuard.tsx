'use client'

import { useEffect } from 'react'
import { clearPhiTables } from '@/lib/phi-cleanup'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/**
 * Invisible guard component that registers beforeunload and visibilitychange
 * listeners to clear PHI tables from IndexedDB when the tab closes or becomes
 * hidden with an expired session.
 *
 * Defense-in-depth: even if the key is wiped (making data unreadable),
 * this removes the encrypted blobs entirely from the workstation.
 */
export function PhiCleanupGuard() {
  useEffect(() => {
    function handleBeforeUnload() {
      // Fire-and-forget — beforeunload has limited time for async ops.
      // clearPhiTables fires all clears in parallel without awaiting.
      void clearPhiTables()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        const { isAuthenticated } = useAuthSessionStore.getState()
        if (!isAuthenticated) {
          void clearPhiTables()
        }
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}

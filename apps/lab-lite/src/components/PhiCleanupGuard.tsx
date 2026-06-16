'use client'

import { useEffect } from 'react'
import { clearPhiTables } from '@/lib/phi-cleanup'
import { clearSessionEncryptionKey } from '@/lib/consent-crypto'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/**
 * Invisible guard component that registers beforeunload and visibilitychange
 * listeners to clear PHI tables from IndexedDB when the tab closes or becomes
 * hidden with an expired session.
 *
 * Also clears the session encryption key used for consent blobs (audio/thumbprint),
 * ensuring those encrypted blobs are permanently unreadable after the session ends.
 *
 * Defence-in-depth: even if the key is wiped (making data unreadable),
 * this removes the patient-linked records from the workstation entirely.
 */
export function PhiCleanupGuard() {
  useEffect(() => {
    function handleBeforeUnload() {
      // Fire-and-forget — beforeunload has limited time for async ops.
      // clearPhiTables fires all clears in parallel without awaiting.
      clearSessionEncryptionKey()
      void clearPhiTables()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        const { isAuthenticated } = useAuthSessionStore.getState()
        if (!isAuthenticated) {
          clearSessionEncryptionKey()
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

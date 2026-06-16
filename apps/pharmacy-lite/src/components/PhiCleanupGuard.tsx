'use client'

import { useEffect } from 'react'
import { clearPhiTables } from '@/lib/phi-cleanup'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { useAuthSessionStore } from '@/stores/auth-session-store'

/**
 * Invisible guard component that registers beforeunload and visibilitychange
 * listeners to clear PHI tables from IndexedDB when the tab closes or becomes
 * hidden with an expired session.
 *
 * Defence-in-depth: even if the key is wiped (making data unreadable),
 * this removes the encrypted blobs entirely from the workstation.
 */
export function PhiCleanupGuard() {
  useEffect(() => {
    function handleBeforeUnload() {
      // Key wipe is synchronous — guaranteed to complete before tab tears down.
      // clearPhiTables is fire-and-forget (async ops may not complete in beforeunload).
      encryptionKeyStore.wipe()
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

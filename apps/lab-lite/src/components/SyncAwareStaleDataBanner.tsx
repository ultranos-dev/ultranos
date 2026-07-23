'use client'

import { useEffect, useState } from 'react'
import { StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'

/** Turn a raw upload-error reason into a human-facing sentence. */
function describeSyncError(reason: string): string {
  if (reason.includes('KYC_REQUIRED')) {
    return 'Results can’t upload — your lab is pending verification. They’ll sync once KYC is approved.'
  }
  if (reason.includes('SUBSCRIPTION_REQUIRED')) {
    return 'Results can’t upload — this organization does not have an active Lab Lite subscription.'
  }
  if (reason.includes('ORG_SUSPENDED')) {
    return 'Results can’t upload — organization access is suspended.'
  }
  return `Couldn’t upload results to the Hub (${reason}). They remain queued and will retry.`
}

export function SyncAwareStaleDataBanner() {
  const [mounted, setMounted] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const failedCount = useSyncStore((s) => s.failedCount)
  const syncError = useSyncStore((s) => s.syncError)

  useEffect(() => {
    setMounted(true)
    // Seed + track live connectivity so the banner only warns about elapsed-time
    // staleness when actually offline (a connected app uploads on demand).
    setIsOnline(navigator.onLine)
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!mounted) return null

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
        onSyncNow={() => {
          window.dispatchEvent(new CustomEvent('ultranos:sync-now'))
        }}
      />
    </>
  )
}

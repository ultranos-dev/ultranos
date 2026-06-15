'use client'

import { useEffect, useState } from 'react'
import { StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'

export function SyncAwareStaleDataBanner() {
  const [mounted, setMounted] = useState(false)
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const failedCount = useSyncStore((s) => s.failedCount)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <StaleDataBanner
      lastSyncedAt={lastSyncedAt}
      failedCount={failedCount}
      onSyncNow={() => {
        window.dispatchEvent(new CustomEvent('ultranos:sync-now'))
      }}
    />
  )
}
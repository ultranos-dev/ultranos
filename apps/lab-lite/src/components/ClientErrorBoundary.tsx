'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { ErrorBoundary, useAsyncErrorBoundary, StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'

const DB_NAME = 'lab-lite'

function AsyncErrorBridge({ children }: { children: ReactNode }) {
  const [asyncError, setAsyncError] = useState<Error | null>(null)

  useAsyncErrorBoundary({
    onStorageError: useCallback((error: unknown) => {
      setAsyncError(error instanceof Error ? error : new Error('Storage error'))
    }, []),
  })

  if (asyncError) throw asyncError

  return <>{children}</>
}

function SyncAwareStaleDataBanner() {
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt)
  const failedCount = useSyncStore((s) => s.failedCount)

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

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="lab-lite" dbName={DB_NAME}>
      <AsyncErrorBridge>
        <SyncAwareStaleDataBanner />
        {children}
      </AsyncErrorBridge>
    </ErrorBoundary>
  )
}

'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary, useAsyncErrorBoundary, StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'
import { SessionTimeoutWrapper } from './SessionTimeoutWrapper'
import { AuthGuard } from './AuthGuard'
import { InstallPrompt } from './InstallPrompt'
import { SwUpdateNotification } from './SwUpdateNotification'

const DB_NAME = 'pharmacy-lite'

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

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="pharmacy-lite" dbName={DB_NAME}>
      <AsyncErrorBridge>
        <AuthGuard>
          <SyncAwareStaleDataBanner />
          <SessionTimeoutWrapper>
            {children}
          </SessionTimeoutWrapper>
          <InstallPrompt />
          <SwUpdateNotification />
        </AuthGuard>
      </AsyncErrorBridge>
    </ErrorBoundary>
  )
}

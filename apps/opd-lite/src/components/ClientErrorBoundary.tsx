'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary, useAsyncErrorBoundary, StaleDataBanner } from '@ultranos/ui-kit'
import { useSyncStore } from '@/stores/sync-store'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { SessionTimeoutWrapper } from './SessionTimeoutWrapper'
import { AuthGuard } from './AuthGuard'
import { InstallPrompt } from './InstallPrompt'

const DB_NAME = 'opd-lite'

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
        // Trigger sync — the sync worker listens for this
        window.dispatchEvent(new CustomEvent('ultranos:sync-now'))
      }}
    />
  )
}

function handleClearEncryptionKey() {
  encryptionKeyStore.wipe()
}

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="opd-lite" dbName={DB_NAME} onClearData={handleClearEncryptionKey}>
      <AsyncErrorBridge>
        <AuthGuard>
          <SyncAwareStaleDataBanner />
          <SessionTimeoutWrapper>
            {children}
          </SessionTimeoutWrapper>
          <InstallPrompt />
        </AuthGuard>
      </AsyncErrorBridge>
    </ErrorBoundary>
  )
}

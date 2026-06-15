'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary, useAsyncErrorBoundary } from '@ultranos/ui-kit'
import { encryptionKeyStore } from '@/lib/encryption-key-store'
import { SessionTimeoutWrapper } from './SessionTimeoutWrapper'
import { AuthGuard } from './AuthGuard'

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

function handleClearEncryptionKey() {
  encryptionKeyStore.wipe()
}

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="opd-lite" dbName={DB_NAME} onClearData={handleClearEncryptionKey}>
      <AsyncErrorBridge>
        <AuthGuard>
          <SessionTimeoutWrapper>
            {children}
          </SessionTimeoutWrapper>
        </AuthGuard>
      </AsyncErrorBridge>
    </ErrorBoundary>
  )
}

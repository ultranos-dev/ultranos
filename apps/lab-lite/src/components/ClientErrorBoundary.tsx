'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ErrorBoundary, useAsyncErrorBoundary } from '@ultranos/ui-kit'
import { SessionTimeoutWrapper } from './SessionTimeoutWrapper'
import { AuthGuard } from './AuthGuard'

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

export function ClientErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary appName="lab-lite" dbName={DB_NAME}>
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

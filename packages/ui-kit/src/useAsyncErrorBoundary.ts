'use client'

import { useEffect } from 'react'
import { isStorageError } from './ErrorBoundary.js'

export interface UseAsyncErrorBoundaryOptions {
  onStorageError: (error: unknown) => void
}

/**
 * Hook that bridges async (non-render) storage errors to a callback,
 * typically used to trigger the Error Boundary's Safe Mode.
 *
 * Non-storage errors (network, etc.) are ignored — they may be transient.
 */
export function useAsyncErrorBoundary({ onStorageError }: UseAsyncErrorBoundaryOptions) {
  useEffect(() => {
    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      if (isStorageError(reason)) {
        event.preventDefault()
        onStorageError(reason)
      }
    }

    function handleError(event: ErrorEvent) {
      if (isStorageError(event.error)) {
        event.preventDefault()
        onStorageError(event.error)
      }
    }

    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('error', handleError)

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('error', handleError)
    }
  }, [onStorageError])
}

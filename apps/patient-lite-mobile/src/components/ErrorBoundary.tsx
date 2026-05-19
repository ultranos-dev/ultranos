import React from 'react'
import { sanitizeError, isStorageError, logErrorDev } from '@/utils/error-sanitizer'
import type { SafeError } from '@/utils/error-sanitizer'
import { ErrorRecoveryScreen } from './ErrorRecoveryScreen'
import { StorageErrorScreen } from './StorageErrorScreen'

const MAX_RETRIES = 3

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallbackComponent?: React.ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
  retryCount: number
}

/**
 * React Error Boundary for patient-lite-mobile.
 * Catches render errors and displays a recovery screen.
 *
 * - Shows StorageErrorScreen for storage-related errors (quota, corruption)
 * - Shows ErrorRecoveryScreen for all other errors
 * - Sanitizes errors — no PHI, stack traces, or internal details shown
 * - Logs raw errors to console in dev mode only
 * - After MAX_RETRIES, disables retry to prevent infinite crash loops
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, error: error instanceof Error ? error : new Error(String(error ?? 'Unknown error')) }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo })

    // Log locally in dev mode only — never remote with PHI
    logErrorDev(error, errorInfo)

    // Notify parent if callback provided
    this.props.onError?.(error, errorInfo)
  }

  resetError = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }))
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      const retriesExhausted = this.state.retryCount >= MAX_RETRIES

      // Allow custom fallback override
      if (this.props.fallbackComponent) {
        return this.props.fallbackComponent
      }

      const safeError: SafeError = sanitizeError(this.state.error)

      // Storage errors get a specialized screen
      if (isStorageError(this.state.error)) {
        return (
          <StorageErrorScreen
            onRetry={retriesExhausted ? undefined : this.resetError}
            safeError={safeError}
            retriesExhausted={retriesExhausted}
          />
        )
      }

      // All other errors: generic recovery screen
      return (
        <ErrorRecoveryScreen
          onRetry={retriesExhausted ? undefined : this.resetError}
          safeError={safeError}
          retriesExhausted={retriesExhausted}
        />
      )
    }

    return this.props.children
  }
}

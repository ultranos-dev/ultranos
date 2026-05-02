'use client'

import { Component, type ReactNode } from 'react'

/** Sanitize error messages to remove any potential PHI content. */
function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'QuotaExceededError':
        return 'Your device has run out of storage space. Local data may be incomplete.'
      case 'VersionError':
        return 'The local database version is incompatible. A reset may be required.'
      case 'AbortError':
        return 'A storage operation was interrupted. Please try again.'
      default:
        return 'A storage error occurred. Your data may need to be refreshed.'
    }
  }
  // Never expose the raw error message — it may contain PHI
  return 'An unexpected error occurred in the application.'
}

function isStorageError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return ['QuotaExceededError', 'VersionError', 'AbortError', 'InvalidStateError'].includes(
      error.name
    )
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('indexeddb') ||
      msg.includes('dexie') ||
      msg.includes('storage quota')
    )
  }
  return false
}

export interface ErrorBoundaryProps {
  children: ReactNode
  appName: string
  dbName: string
  onClearData?: () => void | Promise<void>
}

interface ErrorBoundaryState {
  hasError: boolean
  error: unknown
  retryKey: number
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, retryKey: 0 }
  }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      retryKey: prev.retryKey + 1,
    }))
  }

  handleClearData = async () => {
    try {
      // 1. Delete the app's IndexedDB database (must await — async via IDBRequest)
      if (typeof indexedDB !== 'undefined') {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(this.props.dbName)
          req.onsuccess = () => resolve()
          req.onerror = () => resolve()
          req.onblocked = () => resolve()
        })
      }

      // 2. Run custom clear callback (e.g., wipe encryption session key)
      if (this.props.onClearData) {
        await this.props.onClearData()
      }

      // 3. Clear web storage
      if (typeof localStorage !== 'undefined') localStorage.clear()
      if (typeof sessionStorage !== 'undefined') sessionStorage.clear()

      // 4. Hard reload
      window.location.reload()
    } catch {
      // If clear fails, force reload anyway
      window.location.reload()
    }
  }

  override render() {
    if (this.state.hasError) {
      const storageRelated = isStorageError(this.state.error)
      const description = sanitizeErrorMessage(this.state.error)

      return (
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#fafafa',
            color: '#1a1a1a',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '3rem',
                height: '3rem',
                margin: '0 auto 1rem',
                borderRadius: '50%',
                backgroundColor: storageRelated ? '#fef3c7' : '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
              }}
              aria-hidden="true"
            >
              {storageRelated ? '⚠' : '✕'}
            </div>

            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '0.5rem',
              }}
            >
              Safe Mode
            </h1>

            <p
              style={{
                fontSize: '0.875rem',
                color: '#525252',
                marginBottom: '0.25rem',
              }}
            >
              {storageRelated ? 'A storage error occurred.' : 'An application error occurred.'}
            </p>

            <p
              style={{
                fontSize: '0.875rem',
                color: '#525252',
                marginBottom: '1.5rem',
              }}
            >
              {description}
            </p>

            <p
              style={{
                fontSize: '0.75rem',
                color: '#16a34a',
                fontWeight: 500,
                marginBottom: '1.5rem',
              }}
            >
              Your data is safe on the server. Local data will re-sync after recovery.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
              <button
                type="button"
                onClick={this.handleClearData}
                style={{
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#dc2626',
                  backgroundColor: 'transparent',
                  border: '1px solid #dc2626',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                }}
              >
                Clear Local Data &amp; Reload
              </button>
            </div>
          </div>
        </div>
      )
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}

export { sanitizeErrorMessage, isStorageError }

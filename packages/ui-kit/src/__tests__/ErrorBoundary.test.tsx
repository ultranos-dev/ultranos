import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../ErrorBoundary.js'

// Component that throws on render
function ThrowOnRender({ error }: { error: Error }) {
  throw error
}

// Component that renders normally
function GoodChild() {
  return <div data-testid="good-child">All good</div>
}

describe('ErrorBoundary', () => {
  // Suppress React error boundary console.error noise in test output
  const originalConsoleError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = originalConsoleError
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <GoodChild />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('good-child')).toBeInTheDocument()
  })

  it('catches a thrown QuotaExceededError and renders Safe Mode', () => {
    const quotaError = new DOMException('Storage quota exceeded', 'QuotaExceededError')
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={quotaError} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/safe mode/i)).toBeInTheDocument()
    expect(screen.getByText(/storage error/i)).toBeInTheDocument()
  })

  it('catches a VersionError and renders Safe Mode', () => {
    const versionError = new DOMException('Version change', 'VersionError')
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={versionError} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/safe mode/i)).toBeInTheDocument()
  })

  it('catches generic render errors and renders Safe Mode', () => {
    const genericError = new Error('Something went wrong')
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={genericError} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/safe mode/i)).toBeInTheDocument()
  })

  it('shows Retry and Clear & Reload buttons in Safe Mode', () => {
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={new Error('fail')} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear local data/i })).toBeInTheDocument()
  })

  it('shows reassurance message about server data safety', () => {
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={new Error('fail')} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/your data is safe on the server/i)).toBeInTheDocument()
  })

  it('does NOT display PHI in error output', () => {
    // Simulate an error with PHI-like content in the message
    const phiError = new Error('Patient John Doe ID 12345 diagnosis: Diabetes')
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={phiError} />
      </ErrorBoundary>
    )
    // The raw error message must NOT appear in the rendered output
    expect(screen.queryByText(/John Doe/)).not.toBeInTheDocument()
    expect(screen.queryByText(/12345/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Diabetes/)).not.toBeInTheDocument()
  })

  it('Retry button re-mounts the component tree', () => {
    let shouldThrow = true
    function ConditionalThrow() {
      if (shouldThrow) throw new Error('fail')
      return <div data-testid="recovered">Recovered</div>
    }

    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ConditionalThrow />
      </ErrorBoundary>
    )
    expect(screen.getByText(/safe mode/i)).toBeInTheDocument()

    // Now allow the child to render normally
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(screen.getByTestId('recovered')).toBeInTheDocument()
    expect(screen.queryByText(/safe mode/i)).not.toBeInTheDocument()
  })

  it('provides a descriptive storage error message for IndexedDB errors', () => {
    const idbError = new DOMException('The database connection is closing', 'AbortError')
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={idbError} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/storage error/i)).toBeInTheDocument()
  })

  it('classifies storage errors correctly', () => {
    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError')
    render(
      <ErrorBoundary appName="test-app" dbName="test-db">
        <ThrowOnRender error={quotaError} />
      </ErrorBoundary>
    )
    // Storage errors get a specific description
    expect(screen.getByText(/storage space/i)).toBeInTheDocument()
  })

  it('calls onClearData callback when Clear Local Data button is clicked', async () => {
    const onClearData = vi.fn().mockResolvedValue(undefined)
    // Mock indexedDB.deleteDatabase
    const mockDeleteDb = vi.fn(() => {
      const req = { onsuccess: null as (() => void) | null, onerror: null, onblocked: null }
      setTimeout(() => req.onsuccess?.(), 0)
      return req
    })
    vi.stubGlobal('indexedDB', { deleteDatabase: mockDeleteDb })
    // Mock window.location.reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
    })

    render(
      <ErrorBoundary appName="test-app" dbName="test-db" onClearData={onClearData}>
        <ThrowOnRender error={new Error('fail')} />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByRole('button', { name: /clear local data/i }))

    // Wait for async handleClearData to complete
    await vi.waitFor(() => {
      expect(onClearData).toHaveBeenCalledOnce()
    })
    expect(mockDeleteDb).toHaveBeenCalledWith('test-db')

    vi.unstubAllGlobals()
  })
})

import React from 'react'
import { Text, I18nManager } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Suppress console.error from ErrorBoundary during tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

// Test component that throws on demand
function ThrowingChild({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test render error')
  }
  return <Text testID="child-content">Working content</Text>
}

function StorageThrowingChild() {
  throw new Error('QuotaExceededError: storage limit reached')
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByTestId } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    )
    expect(getByTestId('child-content')).toBeTruthy()
  })

  it('catches thrown error and shows recovery screen', () => {
    const { getByTestId, queryByTestId } = render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('error-recovery-screen')).toBeTruthy()
    expect(queryByTestId('child-content')).toBeNull()
  })

  it('"Tap to Retry" resets error state and re-renders children', () => {
    // Component that throws conditionally based on external flag
    let shouldThrowFlag = true
    function ConditionalThrow() {
      if (shouldThrowFlag) {
        throw new Error('Conditional error')
      }
      return <Text testID="recovered-content">Recovered</Text>
    }

    const { getByTestId } = render(
      <ErrorBoundary>
        <ConditionalThrow />
      </ErrorBoundary>,
    )

    // Should show recovery screen
    expect(getByTestId('error-recovery-screen')).toBeTruthy()

    // Now disable the throw and tap retry
    shouldThrowFlag = false
    fireEvent.press(getByTestId('error-retry-button'))

    // Should now show recovered content
    expect(getByTestId('recovered-content')).toBeTruthy()
  })

  it('shows StorageErrorScreen for storage errors', () => {
    const { getByTestId, queryByTestId } = render(
      <ErrorBoundary>
        <StorageThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('storage-error-screen')).toBeTruthy()
    expect(queryByTestId('error-recovery-screen')).toBeNull()
  })

  it('calls onError callback when error occurs', () => {
    const onError = jest.fn()
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    )
  })

  it('renders custom fallbackComponent when provided', () => {
    const fallback = <Text testID="custom-fallback">Custom error UI</Text>
    const { getByTestId } = render(
      <ErrorBoundary fallbackComponent={fallback}>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('custom-fallback')).toBeTruthy()
  })

  it('does not show PHI in recovery screen', () => {
    function PhiThrowingChild() {
      throw new Error('Failed for patient John Doe ID: P-12345')
    }

    const { queryByText } = render(
      <ErrorBoundary>
        <PhiThrowingChild />
      </ErrorBoundary>,
    )
    // The sanitized error message should not contain any PHI
    expect(queryByText(/John/)).toBeNull()
    expect(queryByText(/P-12345/)).toBeNull()
    expect(queryByText(/patient/i)).toBeNull()
  })

  it('handles non-Error thrown values without crashing', () => {
    function StringThrowingChild() {
      throw 'string error' // eslint-disable-line no-throw-literal
    }

    const { getByTestId } = render(
      <ErrorBoundary>
        <StringThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('error-recovery-screen')).toBeTruthy()
  })

  it('handles null thrown value without crashing', () => {
    function NullThrowingChild() {
      throw null // eslint-disable-line no-throw-literal
    }

    const { getByTestId } = render(
      <ErrorBoundary>
        <NullThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('error-recovery-screen')).toBeTruthy()
  })

  it('disables retry after MAX_RETRIES (3) and shows unavailable message', () => {
    // Component that always throws
    function AlwaysThrows() {
      throw new Error('Permanent error')
    }

    const { getByTestId, queryByTestId } = render(
      <ErrorBoundary>
        <AlwaysThrows />
      </ErrorBoundary>,
    )

    // Retry 3 times
    for (let i = 0; i < 3; i++) {
      expect(getByTestId('error-retry-button')).toBeTruthy()
      fireEvent.press(getByTestId('error-retry-button'))
    }

    // After 3 retries, retry button should be gone
    expect(queryByTestId('error-retry-button')).toBeNull()
    // Report Issue should still be available
    expect(getByTestId('error-report-button')).toBeTruthy()
  })
})

describe('ErrorBoundary — tab independence', () => {
  it('crash in one boundary does not affect sibling boundary', () => {
    function WorkingChild() {
      return <Text testID="working-tab">Tab is working</Text>
    }

    const { getByTestId } = render(
      <>
        <ErrorBoundary>
          <ThrowingChild />
        </ErrorBoundary>
        <ErrorBoundary>
          <WorkingChild />
        </ErrorBoundary>
      </>,
    )

    // Crashed tab shows recovery
    expect(getByTestId('error-recovery-screen')).toBeTruthy()
    // Working tab still renders
    expect(getByTestId('working-tab')).toBeTruthy()
  })
})

describe('ErrorBoundary — RTL support', () => {
  afterEach(() => {
    I18nManager.forceRTL(false)
  })

  it('recovery screen renders in RTL mode', () => {
    I18nManager.forceRTL(true)

    const { getByTestId } = render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('error-recovery-screen')).toBeTruthy()
    expect(getByTestId('error-retry-button')).toBeTruthy()
    expect(getByTestId('error-report-button')).toBeTruthy()
  })

  it('storage error screen renders in RTL mode', () => {
    I18nManager.forceRTL(true)

    const { getByTestId } = render(
      <ErrorBoundary>
        <StorageThrowingChild />
      </ErrorBoundary>,
    )
    expect(getByTestId('storage-error-screen')).toBeTruthy()
    expect(getByTestId('storage-retry-button')).toBeTruthy()
    expect(getByTestId('storage-report-button')).toBeTruthy()
  })
})

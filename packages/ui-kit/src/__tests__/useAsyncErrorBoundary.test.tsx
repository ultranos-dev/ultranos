import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAsyncErrorBoundary } from '../useAsyncErrorBoundary.js'

describe('useAsyncErrorBoundary', () => {
  let addListenerSpy: ReturnType<typeof vi.spyOn>
  let removeListenerSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addListenerSpy = vi.spyOn(window, 'addEventListener')
    removeListenerSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addListenerSpy.mockRestore()
    removeListenerSpy.mockRestore()
  })

  it('registers unhandledrejection listener on mount', () => {
    const onStorageError = vi.fn()
    renderHook(() => useAsyncErrorBoundary({ onStorageError }))
    expect(addListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    )
  })

  it('registers error listener on mount', () => {
    const onStorageError = vi.fn()
    renderHook(() => useAsyncErrorBoundary({ onStorageError }))
    expect(addListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    )
  })

  it('removes listeners on unmount', () => {
    const onStorageError = vi.fn()
    const { unmount } = renderHook(() => useAsyncErrorBoundary({ onStorageError }))
    unmount()
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    )
    expect(removeListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function)
    )
  })

  it('calls onStorageError for storage-related unhandled rejections', () => {
    const onStorageError = vi.fn()
    renderHook(() => useAsyncErrorBoundary({ onStorageError }))

    // Get the registered handler
    const handler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'unhandledrejection'
    )?.[1] as (event: PromiseRejectionEvent) => void

    // Simulate a QuotaExceededError rejection
    // jsdom doesn't have PromiseRejectionEvent, so create a plain object
    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError')
    const event = { reason: quotaError, preventDefault: vi.fn() } as unknown as PromiseRejectionEvent

    act(() => {
      handler(event)
    })

    expect(onStorageError).toHaveBeenCalledWith(quotaError)
  })

  it('does NOT call onStorageError for non-storage errors', () => {
    const onStorageError = vi.fn()
    renderHook(() => useAsyncErrorBoundary({ onStorageError }))

    const handler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'unhandledrejection'
    )?.[1] as (event: PromiseRejectionEvent) => void

    // Simulate a non-storage error (e.g., network error)
    const networkError = new TypeError('Failed to fetch')
    const event = { reason: networkError, preventDefault: vi.fn() } as unknown as PromiseRejectionEvent

    act(() => {
      handler(event)
    })

    expect(onStorageError).not.toHaveBeenCalled()
  })

  it('calls onStorageError for storage-related window error events', () => {
    const onStorageError = vi.fn()
    renderHook(() => useAsyncErrorBoundary({ onStorageError }))

    const handler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'error'
    )?.[1] as (event: ErrorEvent) => void

    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError')
    const event = { error: quotaError, preventDefault: vi.fn() } as unknown as ErrorEvent

    act(() => {
      handler(event)
    })

    expect(onStorageError).toHaveBeenCalledWith(quotaError)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('does NOT call onStorageError for non-storage window error events', () => {
    const onStorageError = vi.fn()
    renderHook(() => useAsyncErrorBoundary({ onStorageError }))

    const handler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'error'
    )?.[1] as (event: ErrorEvent) => void

    const syntaxError = new SyntaxError('Unexpected token')
    const event = { error: syntaxError, preventDefault: vi.fn() } as unknown as ErrorEvent

    act(() => {
      handler(event)
    })

    expect(onStorageError).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

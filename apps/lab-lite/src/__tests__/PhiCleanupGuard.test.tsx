import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PhiCleanupGuard } from '@/components/PhiCleanupGuard'

const { mockClearPhiTables, mockClearSessionKey, mockGetState } = vi.hoisted(() => ({
  mockClearPhiTables: vi.fn().mockResolvedValue(undefined),
  mockClearSessionKey: vi.fn(),
  mockGetState: vi.fn().mockReturnValue({ isAuthenticated: false }),
}))

vi.mock('@/lib/phi-cleanup', () => ({
  clearPhiTables: mockClearPhiTables,
}))

vi.mock('@/lib/consent-crypto', () => ({
  clearSessionEncryptionKey: mockClearSessionKey,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: mockGetState },
}))

describe('PhiCleanupGuard (lab-lite)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetState.mockReturnValue({ isAuthenticated: false })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('renders null (no DOM output)', () => {
    const { container } = render(<PhiCleanupGuard />)
    expect(container.firstChild).toBeNull()
  })

  it('registers beforeunload listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    render(<PhiCleanupGuard />)
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    addSpy.mockRestore()
  })

  it('clears session key and PHI tables when beforeunload fires', () => {
    render(<PhiCleanupGuard />)

    window.dispatchEvent(new Event('beforeunload'))

    expect(mockClearSessionKey).toHaveBeenCalledTimes(1)
    expect(mockClearPhiTables).toHaveBeenCalledTimes(1)
  })

  it('clears session key and PHI tables on visibilitychange when hidden and unauthenticated', () => {
    render(<PhiCleanupGuard />)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClearSessionKey).toHaveBeenCalledTimes(1)
    expect(mockClearPhiTables).toHaveBeenCalledTimes(1)
  })

  it('does NOT clear anything on visibilitychange when authenticated', () => {
    mockGetState.mockReturnValue({ isAuthenticated: true })
    render(<PhiCleanupGuard />)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockClearSessionKey).not.toHaveBeenCalled()
    expect(mockClearPhiTables).not.toHaveBeenCalled()
  })

  it('removes event listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<PhiCleanupGuard />)
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    removeSpy.mockRestore()
  })
})

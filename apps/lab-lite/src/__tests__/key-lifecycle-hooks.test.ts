import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted() creates values BEFORE vi.mock() factories run
// ---------------------------------------------------------------------------
const { mockAuthStore, mockClearSessionKey, mockClearPhiTables } = vi.hoisted(() => {
  const { create } = require('zustand') as typeof import('zustand')
  const store = create<{ isAuthenticated: boolean; session: unknown }>(() => ({
    isAuthenticated: false,
    session: null,
  }))
  return {
    mockAuthStore: store,
    mockClearSessionKey: vi.fn(),
    mockClearPhiTables: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/consent-crypto', () => ({
  clearSessionEncryptionKey: mockClearSessionKey,
}))

vi.mock('@/lib/phi-cleanup', () => ({
  clearPhiTables: mockClearPhiTables,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: mockAuthStore,
}))

// Importing this registers the subscription on mockAuthStore
import '@/lib/key-lifecycle-hooks'

describe('key-lifecycle-hooks (lab-lite)', () => {
  beforeEach(() => {
    // Reset state FIRST (may trigger subscriber), then clear mocks
    mockAuthStore.setState({ isAuthenticated: false, session: null })
    vi.clearAllMocks()
  })

  it('clears the session encryption key when isAuthenticated transitions to false', () => {
    mockAuthStore.setState({ isAuthenticated: true, session: { userId: 'u1' } })
    mockClearSessionKey.mockClear()

    mockAuthStore.setState({ isAuthenticated: false, session: null })

    expect(mockClearSessionKey).toHaveBeenCalledTimes(1)
  })

  it('calls clearPhiTables when isAuthenticated transitions to false', async () => {
    mockAuthStore.setState({ isAuthenticated: true, session: { userId: 'u1' } })
    mockClearPhiTables.mockClear()

    mockAuthStore.setState({ isAuthenticated: false, session: null })

    await Promise.resolve()
    expect(mockClearPhiTables).toHaveBeenCalledTimes(1)
  })

  it('does NOT clear key or tables when transitioning to authenticated', () => {
    mockAuthStore.setState({ isAuthenticated: true, session: { userId: 'u2' } })

    expect(mockClearSessionKey).not.toHaveBeenCalled()
    expect(mockClearPhiTables).not.toHaveBeenCalled()
  })

  it('does NOT fire when already unauthenticated (no transition)', () => {
    mockAuthStore.setState({ isAuthenticated: false, session: null })

    expect(mockClearSessionKey).not.toHaveBeenCalled()
  })
})

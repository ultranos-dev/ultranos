import { describe, it, expect, beforeEach, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted() creates values BEFORE vi.mock() factories run (which are hoisted
// to the top of the file). Any value referenced inside vi.mock() must be here.
// ---------------------------------------------------------------------------
const { mockAuthStore, mockWipe, mockIsReady, mockClearPhiTables } = vi.hoisted(() => {
  const { create } = require('zustand') as typeof import('zustand')
  const store = create<{ isAuthenticated: boolean; session: unknown }>(() => ({
    isAuthenticated: false,
    session: null,
  }))
  return {
    mockAuthStore: store,
    mockWipe: vi.fn(),
    mockIsReady: vi.fn().mockReturnValue(false),
    mockClearPhiTables: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock('@/lib/encryption-key-store', () => ({
  encryptionKeyStore: { wipe: mockWipe, isReady: mockIsReady },
}))

vi.mock('@ultranos/sync-engine', () => ({
  createSyncQueue: vi.fn().mockReturnValue({ restoreAwaitingKeyEntries: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('@/lib/dexie-sync-adapter', () => ({
  dexieSyncAdapter: {},
}))

vi.mock('@/lib/phi-cleanup', () => ({
  clearPhiTables: mockClearPhiTables,
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: mockAuthStore,
}))

// Importing this registers the subscription on mockAuthStore
import '@/lib/key-lifecycle-hooks'

describe('key-lifecycle-hooks (pharmacy-lite)', () => {
  beforeEach(() => {
    // Reset state FIRST (may trigger subscriber), then clear mocks so
    // each test starts with a clean call count.
    mockAuthStore.setState({ isAuthenticated: false, session: null })
    vi.clearAllMocks()
  })

  it('wipes the encryption key when isAuthenticated transitions to false', () => {
    mockAuthStore.setState({ isAuthenticated: true, session: { userId: 'u1' } })
    mockWipe.mockClear()

    mockAuthStore.setState({ isAuthenticated: false, session: null })

    expect(mockWipe).toHaveBeenCalledTimes(1)
  })

  it('calls clearPhiTables when isAuthenticated transitions to false', async () => {
    mockAuthStore.setState({ isAuthenticated: true, session: { userId: 'u1' } })
    mockClearPhiTables.mockClear()

    mockAuthStore.setState({ isAuthenticated: false, session: null })

    await Promise.resolve()
    expect(mockClearPhiTables).toHaveBeenCalledTimes(1)
  })

  it('does NOT wipe key or clear tables when transitioning to authenticated', () => {
    mockAuthStore.setState({ isAuthenticated: true, session: { userId: 'u2' } })

    expect(mockWipe).not.toHaveBeenCalled()
    expect(mockClearPhiTables).not.toHaveBeenCalled()
  })

  it('does NOT fire when already unauthenticated (no transition)', () => {
    // false → false: no change, subscriber must NOT fire
    mockAuthStore.setState({ isAuthenticated: false, session: null })

    expect(mockWipe).not.toHaveBeenCalled()
  })
})

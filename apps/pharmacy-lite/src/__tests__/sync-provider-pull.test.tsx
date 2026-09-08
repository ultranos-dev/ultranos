// apps/pharmacy-lite/src/__tests__/sync-provider-pull.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const mockPull = vi.fn().mockResolvedValue({ pulled: 0, applied: 0 })
vi.mock('@/lib/wholesale/wholesale-pull', () => ({ pullWholesale: (...a: unknown[]) => mockPull(...a) }))

// Stub the drain init so mounting SyncProvider doesn't start real workers
vi.mock('@/lib/sync-drain-init', () => ({
  startSyncDrain: vi.fn(() => () => {}),
  stopSyncDrain: vi.fn(),
  triggerDrain: vi.fn(),
}))

// Stub KRL sync worker
vi.mock('@/lib/krl-sync-worker', () => ({
  startKrlSync: vi.fn(),
  stopKrlSync: vi.fn(),
}))

// Stub audit drain
vi.mock('@/lib/audit', () => ({
  startAuditDrain: vi.fn(),
  stopAuditDrain: vi.fn(),
}))

// Stub key-lifecycle-hooks (side-effect import in SyncProvider)
vi.mock('@/lib/key-lifecycle-hooks', () => ({}))

// Stub trpc getHubApiUrl
vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(() => 'http://localhost:3000'),
}))

// Auth store mock: selector returns isAuthenticated=true; getState returns session with practitionerId
vi.mock('@/stores/auth-session-store', () => {
  const useAuthSessionStore = Object.assign(
    (selector: (s: { isAuthenticated: boolean }) => unknown) =>
      selector({ isAuthenticated: true }),
    {
      getState: () => ({
        session: { practitionerId: 'p1' },
        getAccessToken: vi.fn().mockResolvedValue('tok'),
      }),
    },
  )
  return { useAuthSessionStore }
})

import { SyncProvider } from '@/components/providers/SyncProvider'

/** Flush all pending microtasks so in-flight async guards reset before next step. */
const flushPromises = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => vi.clearAllMocks())

describe('SyncProvider wholesale pull trigger', () => {
  it('runs pullWholesale on mount', async () => {
    render(<SyncProvider><div /></SyncProvider>)
    await vi.waitFor(() => expect(mockPull).toHaveBeenCalled())
  })

  it('runs pullWholesale on the ultranos:sync-now event', async () => {
    render(<SyncProvider><div /></SyncProvider>)
    await vi.waitFor(() => expect(mockPull).toHaveBeenCalledTimes(1))
    // Let the mount pull fully settle (resets in-flight guard) before firing event
    await flushPromises()
    window.dispatchEvent(new Event('ultranos:sync-now'))
    await vi.waitFor(() => expect(mockPull).toHaveBeenCalledTimes(2))
  })
})

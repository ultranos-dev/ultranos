import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Story 59.3 Task 2 (H-OPD-4): useBackgroundSync existed but was never mounted,
// so the SW Background Sync tags were never registered and the SW → client
// ULTRANOS_SYNC_TRIGGER listener never attached. This test mounts the REAL hook
// through SyncProvider (its production mount point) against a fake
// navigator.serviceWorker and verifies the contract that app/sw.ts documents:
//   - one-shot tag  'ultranos-sync-queue'   (sw.ts SYNC_TAG handler)
//   - periodic tag  'ultranos-periodic-sync' (sw.ts PERIODIC_TAG handler)
//   - SW message { type: 'ULTRANOS_SYNC_TRIGGER' } → window 'ultranos:sync-now'

vi.mock('@/lib/key-lifecycle-hooks', () => ({}))
vi.mock('@/lib/audit', () => ({ startAuditDrain: vi.fn(), stopAuditDrain: vi.fn() }))
vi.mock('@/lib/sync-worker', () => ({
  startSyncWorker: vi.fn(),
  stopSyncWorker: vi.fn(),
  triggerDrain: vi.fn(),
}))
vi.mock('@/lib/drug-catalog-sync', () => ({ syncDrugCatalog: vi.fn(async () => {}) }))
vi.mock('@/lib/pharmacy-sync', () => ({ syncPharmacyDirectory: vi.fn(async () => {}) }))
vi.mock('@/lib/lab-sync', () => ({ syncLabDirectory: vi.fn(async () => {}) }))
vi.mock('@/lib/sync-pull', () => ({
  pullPatientChanges: vi.fn(async () => ({ changesApplied: 0, errors: [] })),
  pullPractitionerEncounters: vi.fn(async () => ({ changesApplied: 0, errors: [] })),
}))
vi.mock('@/lib/use-patient-list-sync', () => ({ syncAllPatientsToDb: vi.fn(async () => []) }))
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
  }),
}))

// The hook re-registers the one-shot tag only while items are pending.
vi.mock('@/lib/db', () => ({
  db: {
    syncMeta: {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => '__global__'),
    },
    syncQueue: {
      filter: () => ({ count: async () => 0 }),
      where: () => ({ anyOf: () => ({ count: async () => 2 }) }),
    },
  },
}))

// ---- Fake navigator.serviceWorker (jsdom has none) -------------------------
type MessageHandler = (event: { data?: { type?: string } }) => void
const messageListeners: MessageHandler[] = []
const syncRegister = vi.fn(async (_tag: string) => {})
const periodicRegister = vi.fn(async (_tag: string, _opts: { minInterval: number }) => {})

const fakeServiceWorker = {
  addEventListener: vi.fn((type: string, cb: MessageHandler) => {
    if (type === 'message') messageListeners.push(cb)
  }),
  removeEventListener: vi.fn(),
  ready: Promise.resolve({
    sync: { register: syncRegister },
    periodicSync: { register: periodicRegister },
  }),
}

Object.defineProperty(navigator, 'serviceWorker', {
  value: fakeServiceWorker,
  configurable: true,
})

const { SyncProvider } = await import('@/components/providers/SyncProvider')

describe('SyncProvider background-sync mount (H-OPD-4)', () => {
  beforeEach(() => {
    syncRegister.mockClear()
    periodicRegister.mockClear()
    fakeServiceWorker.addEventListener.mockClear()
    messageListeners.length = 0
  })

  afterAll(() => {
    // Remove the fake so other suites see jsdom's default navigator.
    delete (navigator as unknown as Record<string, unknown>).serviceWorker
  })

  it('registers the Background Sync tags app/sw.ts handles', async () => {
    render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )

    // Tags MUST match the constants in src/app/sw.ts — a mismatch means the SW
    // handlers never fire even though registration "succeeds".
    await waitFor(() => expect(syncRegister).toHaveBeenCalledWith('ultranos-sync-queue'))
    await waitFor(() =>
      expect(periodicRegister).toHaveBeenCalledWith(
        'ultranos-periodic-sync',
        expect.objectContaining({ minInterval: expect.any(Number) }),
      ),
    )
  })

  it('attaches the SW message listener and translates ULTRANOS_SYNC_TRIGGER into ultranos:sync-now', async () => {
    render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )

    await waitFor(() =>
      expect(fakeServiceWorker.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      ),
    )

    const syncNow = vi.fn()
    window.addEventListener('ultranos:sync-now', syncNow)
    try {
      // Unrelated SW message → must NOT trigger a drain.
      for (const listener of messageListeners) listener({ data: { type: 'SOMETHING_ELSE' } })
      expect(syncNow).not.toHaveBeenCalled()

      // The wake-up message sw.ts posts from its sync/periodicsync handlers.
      for (const listener of messageListeners) listener({ data: { type: 'ULTRANOS_SYNC_TRIGGER' } })
      expect(syncNow).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('ultranos:sync-now', syncNow)
    }
  })

  it('detaches the SW message listener on unmount', async () => {
    const { unmount } = render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )
    await waitFor(() =>
      expect(fakeServiceWorker.addEventListener).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      ),
    )

    unmount()
    expect(fakeServiceWorker.removeEventListener).toHaveBeenCalledWith(
      'message',
      expect.any(Function),
    )
  })
})

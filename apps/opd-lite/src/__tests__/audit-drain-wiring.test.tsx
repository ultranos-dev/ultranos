import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'

// Story 59.3 Task 1 (C-OPD-1): startAuditDrain was fully unit-tested but had
// ZERO production callers — 93 auditPhiAccess sites accumulated events in local
// Dexie forever. The failure mode was "built but never mounted", so this test
// asserts the MOUNT PATH: rendering SyncProvider with an authenticated session
// must start the drain (next to the sync worker) and stop it on teardown.

vi.mock('@/lib/key-lifecycle-hooks', () => ({}))

const startAuditDrain = vi.fn()
const stopAuditDrain = vi.fn()
vi.mock('@/lib/audit', () => ({ startAuditDrain, stopAuditDrain }))

const startSyncWorker = vi.fn()
const stopSyncWorker = vi.fn()
vi.mock('@/lib/sync-worker', () => ({
  startSyncWorker,
  stopSyncWorker,
  triggerDrain: vi.fn(),
}))

// Isolate this test from the SW background-sync mount (covered by
// background-sync-mount.test.tsx).
vi.mock('@/hooks/useBackgroundSync', () => ({ useBackgroundSync: vi.fn() }))

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
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'drain-token' } },
      }),
    },
  }),
}))

vi.mock('@/lib/db', () => ({
  db: {
    syncMeta: {
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => '__global__'),
    },
    syncQueue: {
      filter: () => ({ count: async () => 0 }),
      update: vi.fn(async () => 0),
      where: () => ({ anyOf: () => ({ count: async () => 0 }) }),
    },
  },
}))

const { SyncProvider } = await import('@/components/providers/SyncProvider')
const { useAuthSessionStore } = await import('@/stores/auth-session-store')

function signIn() {
  act(() => {
    useAuthSessionStore.getState().setSession({
      userId: 'user-1',
      practitionerId: 'Practitioner/pr-1',
      role: 'DOCTOR',
      sessionId: 'sess-1',
      email: 'doc@example.test',
    })
  })
}

describe('SyncProvider audit-drain wiring (mount path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => {
      useAuthSessionStore.getState().clearSession()
    })
  })

  it('starts the audit drain when a session exists, pointed at the tRPC base, with the cached token', async () => {
    signIn()
    render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )

    await waitFor(() => expect(startAuditDrain).toHaveBeenCalledTimes(1))

    // Started next to the sync worker in the same auth effect.
    expect(startSyncWorker).toHaveBeenCalledTimes(1)

    const [drainUrl, getToken] = startAuditDrain.mock.calls[0] as [string, () => string]
    // The drain worker appends `/audit.sync` (a tRPC procedure), so it MUST
    // receive the /api/trpc base — the bare origin would 404 silently.
    expect(drainUrl).toMatch(/\/api\/trpc$/)
    // The token getter must return the SyncProvider-cached Supabase token
    // (refreshed on the same 10-min cadence as the sync worker's).
    expect(getToken()).toBe('drain-token')
  })

  it('does NOT start the drain when unauthenticated', async () => {
    render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )

    // Give any stray async effect a tick to run.
    await act(async () => {
      await Promise.resolve()
    })
    expect(startAuditDrain).not.toHaveBeenCalled()
  })

  it('stops the drain on unmount', async () => {
    signIn()
    const { unmount } = render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )
    await waitFor(() => expect(startAuditDrain).toHaveBeenCalledTimes(1))

    unmount()
    expect(stopAuditDrain).toHaveBeenCalled()
  })

  it('stops the drain on sign-out', async () => {
    signIn()
    render(
      <SyncProvider>
        <div />
      </SyncProvider>,
    )
    await waitFor(() => expect(startAuditDrain).toHaveBeenCalledTimes(1))

    act(() => {
      useAuthSessionStore.getState().clearSession()
    })
    await waitFor(() => expect(stopAuditDrain).toHaveBeenCalled())
  })
})

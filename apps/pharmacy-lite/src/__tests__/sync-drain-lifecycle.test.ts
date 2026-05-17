import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock DrainWorker from sync-engine
const mockStart = vi.fn()
const mockStop = vi.fn()
const MockDrainWorker = vi.fn().mockImplementation(() => ({
  start: mockStart,
  stop: mockStop,
}))

vi.mock('@ultranos/sync-engine', () => ({
  DrainWorker: MockDrainWorker,
  createSyncQueue: vi.fn().mockReturnValue({
    enqueue: vi.fn(),
    getPending: vi.fn().mockResolvedValue([]),
    markSyncing: vi.fn(),
    markSynced: vi.fn(),
    markFailed: vi.fn(),
    recoverStale: vi.fn(),
    getCounts: vi.fn().mockResolvedValue({ pendingCount: 0, failedCount: 0 }),
    getLastSyncedAt: vi.fn().mockResolvedValue(null),
  }),
}))

// Mock dependencies
vi.mock('@/lib/dexie-sync-adapter', () => ({
  dexieSyncAdapter: {},
}))

vi.mock('@/lib/drain-sync-fn', () => ({
  drainSyncFn: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/stores/sync-store', () => ({
  useSyncStore: {
    getState: () => ({
      updateSyncStatus: vi.fn(),
    }),
  },
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({
      session: { practitionerId: 'p1' },
      getAccessToken: vi.fn().mockResolvedValue('test-token'),
    }),
  },
}))

vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { SYNC: 'SYNC' },
  AuditResourceType: { PRESCRIPTION: 'PRESCRIPTION' },
}))

const { startSyncDrain, stopSyncDrain } = await import('@/lib/sync-drain-init')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  stopSyncDrain()
})

describe('Sync drain worker lifecycle', () => {
  it('starts the drain worker (AC #1)', () => {
    startSyncDrain()

    expect(MockDrainWorker).toHaveBeenCalledTimes(1)
    expect(mockStart).toHaveBeenCalledTimes(1)
  })

  it('stops the drain worker', () => {
    startSyncDrain()
    stopSyncDrain()

    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('stops existing worker before starting a new one (idempotent)', () => {
    startSyncDrain()
    startSyncDrain()

    // First worker stopped before second created
    expect(mockStop).toHaveBeenCalledTimes(1)
    expect(MockDrainWorker).toHaveBeenCalledTimes(2)
    expect(mockStart).toHaveBeenCalledTimes(2)
  })

  it('stopSyncDrain is safe to call when not running', () => {
    expect(() => stopSyncDrain()).not.toThrow()
  })

  it('configures DrainWorker with 30s poll interval', () => {
    startSyncDrain()

    const config = MockDrainWorker.mock.calls[0][0]
    expect(config.pollIntervalMs).toBe(30_000)
  })

  it('configures onStatusUpdate callback', () => {
    startSyncDrain()

    const config = MockDrainWorker.mock.calls[0][0]
    expect(config.onStatusUpdate).toBeDefined()
  })

  it('configures onAudit callback', () => {
    startSyncDrain()

    const config = MockDrainWorker.mock.calls[0][0]
    expect(config.onAudit).toBeDefined()
  })

  it('configures syncFn callback', () => {
    startSyncDrain()

    const config = MockDrainWorker.mock.calls[0][0]
    expect(config.syncFn).toBeDefined()
  })
})

import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

jest.mock('@/lib/audit', () => ({
  emitAuditEvent: jest.fn(),
}))

// Mock the drain worker module
const mockDrain = jest.fn().mockResolvedValue(undefined)
const mockStart = jest.fn()
const mockStop = jest.fn()

jest.mock('@ultranos/sync-engine', () => ({
  DrainWorker: jest.fn().mockImplementation(() => ({
    start: mockStart,
    stop: mockStop,
    drain: mockDrain,
  })),
  createSyncQueue: jest.fn().mockReturnValue({
    enqueue: jest.fn(),
    getPending: jest.fn().mockResolvedValue([]),
    markSyncing: jest.fn(),
    markSynced: jest.fn(),
    markFailed: jest.fn(),
    recoverStale: jest.fn(),
    getCounts: jest.fn().mockResolvedValue({ pendingCount: 0, failedCount: 0 }),
    getLastSyncedAt: jest.fn().mockResolvedValue(null),
  }),
}))

jest.mock('@/lib/sqlite-sync-adapter', () => ({
  createSqliteSyncAdapter: jest.fn().mockReturnValue({}),
}))

jest.mock('@/lib/drain-sync-fn', () => ({
  createDrainSyncFn: jest.fn().mockReturnValue(jest.fn()),
}))

import {
  startDrainWorker,
  stopDrainWorker,
  getSyncQueue,
  isDrainWorkerRunning,
} from '@/lib/sync-drain-init'

function createMockDb() {
  return {
    runAsync: jest.fn(),
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn().mockResolvedValue([]),
    execAsync: jest.fn(),
    closeAsync: jest.fn(),
  }
}

const mockConfig = {
  getAuthToken: jest.fn().mockResolvedValue('token'),
  getHubUrl: () => 'https://hub.test',
}

describe('sync-drain-init', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset singleton state
    stopDrainWorker()
  })

  describe('startDrainWorker', () => {
    it('creates and starts a DrainWorker', () => {
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      expect(mockStart).toHaveBeenCalled()
      expect(isDrainWorkerRunning()).toBe(true)
    })

    it('returns a SyncQueue instance', () => {
      const db = createMockDb()
      const queue = startDrainWorker(db as any, mockConfig)
      expect(queue).toBeDefined()
      expect(getSyncQueue()).toBe(queue)
    })

    it('is idempotent — second call returns same queue', () => {
      const db = createMockDb()
      const q1 = startDrainWorker(db as any, mockConfig)
      const q2 = startDrainWorker(db as any, mockConfig)
      expect(q1).toBe(q2)
      expect(mockStart).toHaveBeenCalledTimes(1)
    })

    it('subscribes to NetInfo connectivity changes', () => {
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      expect(NetInfo.addEventListener).toHaveBeenCalled()
    })

    it('subscribes to AppState changes', () => {
      const spy = jest.spyOn(AppState, 'addEventListener')
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      expect(spy).toHaveBeenCalledWith('change', expect.any(Function))
      spy.mockRestore()
    })
  })

  describe('stopDrainWorker', () => {
    it('stops the drain worker and clears state', () => {
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)
      expect(isDrainWorkerRunning()).toBe(true)

      stopDrainWorker()
      expect(mockStop).toHaveBeenCalled()
      expect(isDrainWorkerRunning()).toBe(false)
      expect(getSyncQueue()).toBeNull()
    })

    it('is safe to call when not running', () => {
      expect(() => stopDrainWorker()).not.toThrow()
    })
  })

  describe('connectivity triggers', () => {
    it('triggers drain on NetInfo online event', () => {
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      // Get the callback passed to NetInfo.addEventListener
      const netInfoCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0]
      netInfoCallback({ isConnected: true })

      expect(mockDrain).toHaveBeenCalled()
    })

    it('does not drain when offline', () => {
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      const netInfoCallback = (NetInfo.addEventListener as jest.Mock).mock.calls[0][0]
      netInfoCallback({ isConnected: false })

      expect(mockDrain).not.toHaveBeenCalled()
    })

    it('triggers drain on app foregrounding', () => {
      const spy = jest.spyOn(AppState, 'addEventListener')
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      // Get the callback passed to AppState.addEventListener
      const appStateCallback = spy.mock.calls[0][1] as (state: string) => void
      appStateCallback('active')

      expect(mockDrain).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('does not drain on app backgrounding', () => {
      const spy = jest.spyOn(AppState, 'addEventListener')
      const db = createMockDb()
      startDrainWorker(db as any, mockConfig)

      const appStateCallback = spy.mock.calls[0][1] as (state: string) => void
      appStateCallback('background')

      expect(mockDrain).not.toHaveBeenCalled()
      spy.mockRestore()
    })
  })
})

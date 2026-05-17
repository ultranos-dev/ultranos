import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockGaugeSet, mockSendAlert, mockFrom } = vi.hoisted(() => ({
  mockGaugeSet: vi.fn(),
  mockSendAlert: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('prom-client', () => ({
  Gauge: vi.fn().mockImplementation(() => ({
    set: mockGaugeSet,
  })),
}))

vi.mock('../lib/alert-notifier', () => ({
  sendAlert: (...args: unknown[]) => mockSendAlert(...args),
}))

vi.mock('../lib/supabase', () => ({
  getSupabaseClient: vi.fn().mockReturnValue({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

vi.mock('../trpc/middleware/metrics', () => ({
  getMetricsRegistry: vi.fn().mockReturnValue({
    registerMetric: vi.fn(),
  }),
}))

import { runSyncQueueMonitor } from '../jobs/sync-queue-monitor'

describe('Sync Queue Depth Monitor — Story 23.1 Task 6', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries sync queue table and records gauge metrics per spoke type', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          { spoke_type: 'OPD', count: 50, oldest_created_at: new Date().toISOString() },
          { spoke_type: 'Pharmacy', count: 200, oldest_created_at: new Date().toISOString() },
          { spoke_type: 'Lab', count: 10, oldest_created_at: new Date().toISOString() },
          { spoke_type: 'Patient', count: 5, oldest_created_at: new Date().toISOString() },
        ],
        error: null,
      }),
    })

    await runSyncQueueMonitor()

    // Should set gauge for each spoke type
    expect(mockGaugeSet).toHaveBeenCalledTimes(4)
    expect(mockGaugeSet).toHaveBeenCalledWith({ spoke_type: 'OPD' }, 50)
    expect(mockGaugeSet).toHaveBeenCalledWith({ spoke_type: 'Pharmacy' }, 200)
  })

  it('emits alert when >1000 pending events for >1 hour', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          { spoke_type: 'OPD', count: 1500, oldest_created_at: twoHoursAgo },
          { spoke_type: 'Pharmacy', count: 200, oldest_created_at: new Date().toISOString() },
        ],
        error: null,
      }),
    })

    await runSyncQueueMonitor()

    expect(mockSendAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'P2',
        title: expect.stringContaining('Sync Queue'),
        metric: 'sync_queue_depth',
      }),
    )
    // Only OPD should trigger, not Pharmacy (under threshold)
    expect(mockSendAlert).toHaveBeenCalledTimes(1)
  })

  it('does NOT alert when queue depth is under 1000', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          { spoke_type: 'OPD', count: 500, oldest_created_at: new Date().toISOString() },
        ],
        error: null,
      }),
    })

    await runSyncQueueMonitor()

    expect(mockSendAlert).not.toHaveBeenCalled()
  })

  it('does NOT alert when >1000 events but oldest is under 1 hour', async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    mockFrom.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: [
          { spoke_type: 'OPD', count: 1500, oldest_created_at: thirtyMinutesAgo },
        ],
        error: null,
      }),
    })

    await runSyncQueueMonitor()

    expect(mockSendAlert).not.toHaveBeenCalled()
  })
})

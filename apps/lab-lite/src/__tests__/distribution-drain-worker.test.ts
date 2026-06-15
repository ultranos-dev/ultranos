/**
 * Story 42.6 — Distribution Drain Worker Unit Tests
 * Task 8: Priority ordering, backoff, retry limits, offline queue persistence.
 * AC: 7, 8, 9
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { drainDistributionQueue, _resetDrainGuard } from '../lib/distribution/drain-worker'
import type { DistributionQueueEntry } from '../lib/db'

const mockGetPending = vi.fn()
const mockUpdateEntry = vi.fn()
const mockUpsertLabStat = vi.fn()
const mockGetDb = vi.fn()

vi.mock('../lib/db', () => ({
  getPendingDistributionEntries: (...args: unknown[]) => mockGetPending(...args),
  updateDistributionQueueEntry: (...args: unknown[]) => mockUpdateEntry(...args),
  upsertLabStat: (...args: unknown[]) => mockUpsertLabStat(...args),
  getDb: () => mockGetDb(),
}))

function makeEntry(
  id: number,
  destination: DistributionQueueEntry['destination'],
  priority: number,
  payload = '{}',
): DistributionQueueEntry {
  return {
    id,
    reportId: `report-${id}`,
    destination,
    payload,
    status: 'pending',
    retryCount: 0,
    lastAttemptAt: null,
    createdAt: `2026-06-01T10:0${id}:00.000Z`,
    priority,
  }
}

const noopAuditFn = vi.fn()
const noopSleepFn = vi.fn().mockResolvedValue(undefined)

describe('drainDistributionQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetDrainGuard()
    mockUpdateEntry.mockResolvedValue(undefined)
    mockUpsertLabStat.mockResolvedValue(undefined)
    // Default logbook mock
    mockGetDb.mockReturnValue({
      labLogbook: {
        where: () => ({ equals: () => ({ first: () => Promise.resolve({ id: 'lb-1' }) }) }),
      },
    })
  })

  it('processes STATS entries by calling upsertLabStat', async () => {
    const statsPayload = JSON.stringify({
      loincCode: '26464-8',
      flagLevel: 'normal',
      date: '2026-06-01',
      yearMonth: '2026-06',
      turnaroundMinutes: 90,
    })
    mockGetPending.mockResolvedValue([makeEntry(1, 'STATS', 3, statsPayload)])

    await drainDistributionQueue({ onAuditEvent: noopAuditFn, sleep: noopSleepFn })

    expect(mockUpsertLabStat).toHaveBeenCalledWith('2026-06', '26464-8', 'normal', 90)
    expect(mockUpdateEntry).toHaveBeenCalledWith(1, { status: 'delivered' })
  })

  it('processes LOGBOOK entries locally without Hub call', async () => {
    const logbookPayload = JSON.stringify({ diagnosticReportId: 'dr-001' })
    mockGetPending.mockResolvedValue([makeEntry(1, 'LOGBOOK', 3, logbookPayload)])

    await drainDistributionQueue({ onAuditEvent: noopAuditFn, sleep: noopSleepFn })

    // No Hub call needed — local only
    expect(mockUpdateEntry).toHaveBeenCalledWith(1, { status: 'delivered' })
    expect(noopAuditFn).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISTRIBUTION_DELIVERED', destination: 'LOGBOOK' }),
    )
  })

  it('emits DISTRIBUTION_DELIVERED for successful entries', async () => {
    const statsPayload = JSON.stringify({ loincCode: '26464-8', flagLevel: 'normal', date: '2026-06-01', yearMonth: '2026-06', turnaroundMinutes: 0 })
    mockGetPending.mockResolvedValue([makeEntry(1, 'STATS', 3, statsPayload)])

    await drainDistributionQueue({ onAuditEvent: noopAuditFn, sleep: noopSleepFn })

    expect(noopAuditFn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISTRIBUTION_DELIVERED',
        entryId: 1,
        reportId: 'report-1',
        destination: 'STATS',
      }),
    )
  })

  it('retries failed Hub-bound entries up to MAX_RETRIES (5)', async () => {
    const mockEnqueueSync = vi.fn().mockRejectedValue(new Error('Offline'))
    mockGetPending.mockResolvedValue([makeEntry(1, 'OPD_LITE', 3)])

    await drainDistributionQueue({
      onAuditEvent: noopAuditFn,
      sleep: noopSleepFn,
      enqueueSyncFn: mockEnqueueSync,
    })

    // 5 delivery attempts
    expect(mockEnqueueSync).toHaveBeenCalledTimes(5)
    // Status should be 'failed' after max retries
    expect(mockUpdateEntry).toHaveBeenLastCalledWith(1, expect.objectContaining({ status: 'failed' }))
  })

  it('emits DISTRIBUTION_RETRY for intermediate failures', async () => {
    const mockEnqueueSync = vi.fn().mockRejectedValue(new Error('Offline'))
    mockGetPending.mockResolvedValue([makeEntry(1, 'OPD_LITE', 3)])

    await drainDistributionQueue({
      onAuditEvent: noopAuditFn,
      sleep: noopSleepFn,
      enqueueSyncFn: mockEnqueueSync,
    })

    const retryEvents = noopAuditFn.mock.calls
      .filter((c: [{ action: string }]) => c[0].action === 'DISTRIBUTION_RETRY')
    const failedEvents = noopAuditFn.mock.calls
      .filter((c: [{ action: string }]) => c[0].action === 'DISTRIBUTION_FAILED')

    // 4 retries + 1 final failure
    expect(retryEvents).toHaveLength(4)
    expect(failedEvents).toHaveLength(1)
  })

  it('emits DISTRIBUTION_FAILED for final failure', async () => {
    const mockEnqueueSync = vi.fn().mockRejectedValue(new Error('Offline'))
    mockGetPending.mockResolvedValue([makeEntry(1, 'PATIENT_LITE', 2)])

    await drainDistributionQueue({
      onAuditEvent: noopAuditFn,
      sleep: noopSleepFn,
      enqueueSyncFn: mockEnqueueSync,
    })

    const failedEvent = noopAuditFn.mock.calls.find(
      (c: [{ action: string }]) => c[0].action === 'DISTRIBUTION_FAILED',
    )
    expect(failedEvent).toBeDefined()
    expect(failedEvent[0].entryId).toBe(1)
    expect(failedEvent[0].destination).toBe('PATIENT_LITE')
  })

  it('is idempotent (drain guard prevents concurrent runs)', async () => {
    const statsPayload = JSON.stringify({ loincCode: '26464-8', flagLevel: 'normal', date: '2026-06-01', yearMonth: '2026-06', turnaroundMinutes: 0 })
    mockGetPending.mockResolvedValue([makeEntry(1, 'STATS', 3, statsPayload)])

    // Start two drains concurrently
    const [, second] = await Promise.all([
      drainDistributionQueue({ onAuditEvent: noopAuditFn, sleep: noopSleepFn }),
      drainDistributionQueue({ onAuditEvent: noopAuditFn, sleep: noopSleepFn }),
    ])

    // getPending should only be called once (second drain was blocked by guard)
    expect(mockGetPending).toHaveBeenCalledTimes(1)
  })

  it('processes OPD_LITE via enqueueSyncFn successfully', async () => {
    const mockEnqueueSync = vi.fn().mockResolvedValue(undefined)
    const opdPayload = JSON.stringify({ id: 'report-001', resourceType: 'DiagnosticReport' })
    mockGetPending.mockResolvedValue([makeEntry(1, 'OPD_LITE', 3, opdPayload)])

    await drainDistributionQueue({
      onAuditEvent: noopAuditFn,
      sleep: noopSleepFn,
      enqueueSyncFn: mockEnqueueSync,
    })

    expect(mockEnqueueSync).toHaveBeenCalledWith('OPD_LITE', opdPayload)
    expect(mockUpdateEntry).toHaveBeenCalledWith(1, { status: 'delivered' })
  })

  it('fails OPD_LITE immediately when no enqueueSyncFn is provided', async () => {
    mockGetPending.mockResolvedValue([makeEntry(1, 'OPD_LITE', 3)])

    await drainDistributionQueue({ onAuditEvent: noopAuditFn, sleep: noopSleepFn })

    // Should eventually reach FAILED status (no sync fn = always throws)
    expect(mockUpdateEntry).toHaveBeenLastCalledWith(1, expect.objectContaining({ status: 'failed' }))
  })
})

describe('drain backoff timing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetDrainGuard()
    mockGetDb.mockReturnValue({
      labLogbook: {
        where: () => ({ equals: () => ({ first: () => Promise.resolve(null) }) }),
      },
    })
  })

  it('waits correct backoff durations between retries', async () => {
    const sleepCalls: number[] = []
    const mockSleep = (ms: number) => {
      sleepCalls.push(ms)
      return Promise.resolve()
    }
    const mockEnqueueSync = vi.fn().mockRejectedValue(new Error('Offline'))
    mockGetPending.mockResolvedValue([makeEntry(1, 'OPD_LITE', 3)])
    mockUpdateEntry.mockResolvedValue(undefined)

    await drainDistributionQueue({
      onAuditEvent: noopAuditFn,
      sleep: mockSleep,
      enqueueSyncFn: mockEnqueueSync,
    })

    // Backoffs: 1^0=1s, 4^1=4s, 4^2=16s, 4^3=64s (4 sleeps before final failure)
    expect(sleepCalls).toHaveLength(4)
    expect(sleepCalls[0]).toBe(1_000)
    expect(sleepCalls[1]).toBe(4_000)
    expect(sleepCalls[2]).toBe(16_000)
    expect(sleepCalls[3]).toBe(64_000)
  })
})

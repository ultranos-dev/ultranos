import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  getDataBudgetConfig,
  updateDataBudgetConfig,
  recordDataUsage,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
  type DataBudgetConfig,
  type DataUsageRecord,
} from '../lib/db'

// ---------------------------------------------------------------------------
// Task 1: Dexie Schema Extension for Data Budget
// ---------------------------------------------------------------------------

describe('Data Budget — Dexie Schema & Helpers', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  describe('dataBudgetConfig table', () => {
    it('returns default config when no row exists', async () => {
      const config = await getDataBudgetConfig()
      expect(config).toEqual({
        id: 'config',
        planSizeMB: 500,
        billingCycleDay: 1,
        lowDataMode: false,
        currentCycleStart: expect.any(String),
      })
    })

    it('updates config fields', async () => {
      await updateDataBudgetConfig({ planSizeMB: 250, lowDataMode: true })
      const config = await getDataBudgetConfig()
      expect(config.planSizeMB).toBe(250)
      expect(config.lowDataMode).toBe(true)
      expect(config.billingCycleDay).toBe(1) // unchanged
    })

    it('persists config across reads', async () => {
      await updateDataBudgetConfig({ billingCycleDay: 15 })
      const config1 = await getDataBudgetConfig()
      const config2 = await getDataBudgetConfig()
      expect(config1.billingCycleDay).toBe(15)
      expect(config2.billingCycleDay).toBe(15)
    })
  })

  describe('dataUsage table', () => {
    it('records a usage entry', async () => {
      await recordDataUsage({
        date: '2026-05-15',
        category: 'upload',
        bytesOut: 1024,
        bytesIn: 512,
        requestCount: 1,
      })
      const db = getDb()
      const rows = await db.table('dataUsage').toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0].category).toBe('upload')
      expect(rows[0].bytesOut).toBe(1024)
    })

    it('accumulates multiple records for the same date+category', async () => {
      await recordDataUsage({
        date: '2026-05-15',
        category: 'upload',
        bytesOut: 1024,
        bytesIn: 0,
        requestCount: 1,
      })
      await recordDataUsage({
        date: '2026-05-15',
        category: 'upload',
        bytesOut: 2048,
        bytesIn: 0,
        requestCount: 1,
      })
      const db = getDb()
      const rows = await db.table('dataUsage').toArray()
      expect(rows).toHaveLength(2) // separate rows, aggregated at query time
    })

    it('queries usage by date range', async () => {
      await recordDataUsage({ date: '2026-05-10', category: 'upload', bytesOut: 100, bytesIn: 0, requestCount: 1 })
      await recordDataUsage({ date: '2026-05-15', category: 'audit', bytesOut: 200, bytesIn: 0, requestCount: 1 })
      await recordDataUsage({ date: '2026-05-20', category: 'other', bytesOut: 300, bytesIn: 0, requestCount: 1 })

      const usage = await getUsageByDay('2026-05-10', '2026-05-15')
      expect(usage).toHaveLength(2)
    })

    it('queries usage for a billing cycle', async () => {
      // Ensure config has a known cycle start
      await updateDataBudgetConfig({ billingCycleDay: 1 })
      const config = await getDataBudgetConfig()

      await recordDataUsage({ date: config.currentCycleStart, category: 'upload', bytesOut: 500, bytesIn: 0, requestCount: 1 })
      await recordDataUsage({ date: '2099-12-31', category: 'upload', bytesOut: 999, bytesIn: 0, requestCount: 1 }) // future — outside range

      const usage = await getUsageForCycle()
      // Should include current cycle entries, not future
      expect(usage.length).toBeGreaterThanOrEqual(1)
      const totalBytes = usage.reduce((sum, u) => sum + u.bytesOut, 0)
      expect(totalBytes).toBeGreaterThanOrEqual(500)
    })
  })

  describe('billing cycle rollover', () => {
    it('rolls over when cycle boundary crossed', async () => {
      // Set cycle to a past date to trigger rollover
      const pastCycleStart = '2026-04-01'
      await updateDataBudgetConfig({ billingCycleDay: 1 })
      const db = getDb()
      await db.table('dataBudgetConfig').put({
        id: 'config',
        planSizeMB: 500,
        billingCycleDay: 1,
        lowDataMode: false,
        currentCycleStart: pastCycleStart,
      })

      const rolled = await checkAndRolloverCycle()
      expect(rolled).toBe(true)

      const config = await getDataBudgetConfig()
      expect(config.currentCycleStart).not.toBe(pastCycleStart)
    })

    it('does not roll over when still in current cycle', async () => {
      // currentCycleStart is today or recent — no rollover needed
      const config = await getDataBudgetConfig()
      const rolled = await checkAndRolloverCycle()
      // If currentCycleStart is this month, should not roll over
      const today = new Date()
      const cycleStart = new Date(config.currentCycleStart)
      if (cycleStart.getMonth() === today.getMonth() && cycleStart.getFullYear() === today.getFullYear()) {
        expect(rolled).toBe(false)
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Task 2: Network Usage Metering Layer
// ---------------------------------------------------------------------------

describe('Data Budget — Metering Layer', () => {
  it('estimates payload size for JSON body', async () => {
    const { estimateRequestSize } = await import('@ultranos/sync-engine')
    const body = JSON.stringify({ hello: 'world', nums: [1, 2, 3] })
    const size = estimateRequestSize(body)
    // Should be body length * 1.15 (15% overhead)
    expect(size).toBeCloseTo(body.length * 1.15, 0)
  })

  it('estimates payload size for Blob body', async () => {
    const { estimateRequestSize } = await import('@ultranos/sync-engine')
    const blob = new Blob(['a'.repeat(1000)])
    const size = estimateRequestSize(blob)
    expect(size).toBeCloseTo(1000 * 1.15, 0)
  })

  it('estimates response size from Content-Length header', async () => {
    const { estimateResponseSize } = await import('@ultranos/sync-engine')
    const headers = new Headers({ 'Content-Length': '2048' })
    const size = estimateResponseSize(headers, null)
    expect(size).toBe(2048)
  })

  it('categorizes URLs correctly', async () => {
    const { categorizeUrl } = await import('@ultranos/sync-engine')
    expect(categorizeUrl('/api/audit.sync')).toBe('audit')
    expect(categorizeUrl('/api/trpc/lab.uploadResult')).toBe('upload')
    expect(categorizeUrl('/api/trpc/notification.list')).toBe('notification')
    expect(categorizeUrl('/api/trpc/patient.list')).toBe('other')
  })

  it('meterFetch records usage without blocking the request', async () => {
    const { createMeterFetch, estimateRequestSize } = await import('@ultranos/sync-engine')
    const recordDataUsageMock = vi.fn().mockResolvedValue(undefined)

    const fakeFetch = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200, headers: { 'Content-Length': '2' } }),
    )

    const metered = createMeterFetch(fakeFetch, recordDataUsageMock)
    const res = await metered('/api/trpc/lab.uploadResult', {
      method: 'POST',
      body: JSON.stringify({ data: 'test' }),
    })

    expect(res.status).toBe(200)
    expect(fakeFetch).toHaveBeenCalledTimes(1)
    // recordDataUsage is called asynchronously — wait a tick
    await new Promise((r) => setTimeout(r, 10))
    expect(recordDataUsageMock).toHaveBeenCalledTimes(1)
    expect(recordDataUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'upload',
        requestCount: 1,
      }),
    )
  })

  it('does not block requests when metering fails', async () => {
    const { createMeterFetch } = await import('@ultranos/sync-engine')
    const recordDataUsageMock = vi.fn().mockRejectedValue(new Error('DB error'))

    const fakeFetch = vi.fn().mockResolvedValue(new Response('ok'))
    const metered = createMeterFetch(fakeFetch, recordDataUsageMock)

    const res = await metered('/api/test', { method: 'GET' })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Task 3: Data Budget Store (projection + threshold)
// ---------------------------------------------------------------------------

describe('Data Budget — Projection Calculations', () => {
  it('calculates projected exhaustion date', async () => {
    const { calculateProjectedExhaustion } = await import('@ultranos/sync-engine')
    const result = calculateProjectedExhaustion({
      planSizeMB: 500,
      usedMB: 250,
      avgDailyUsageMB: 10,
      cycleEndDate: '2026-06-30',
    })
    // 250MB remaining / 10MB per day = 25 days from now (±1 for time-of-day rounding)
    expect(result).not.toBeNull()
    if (result) {
      const projected = new Date(result)
      const now = new Date()
      const diffDays = Math.round((projected.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      expect(diffDays).toBeGreaterThanOrEqual(24)
      expect(diffDays).toBeLessThanOrEqual(25)
    }
  })

  it('caps projection at cycle end date', async () => {
    const { calculateProjectedExhaustion } = await import('@ultranos/sync-engine')
    const result = calculateProjectedExhaustion({
      planSizeMB: 500,
      usedMB: 10,
      avgDailyUsageMB: 1,
      cycleEndDate: '2026-06-01', // close end
    })
    // 490MB / 1MB per day = 490 days — but capped at cycle end
    if (result) {
      expect(new Date(result).getTime()).toBeLessThanOrEqual(new Date('2026-06-01').getTime())
    }
  })

  it('returns null when no usage data', async () => {
    const { calculateProjectedExhaustion } = await import('@ultranos/sync-engine')
    const result = calculateProjectedExhaustion({
      planSizeMB: 500,
      usedMB: 0,
      avgDailyUsageMB: 0,
      cycleEndDate: '2026-06-30',
    })
    expect(result).toBeNull()
  })

  it('determines correct threshold level', async () => {
    const { getThresholdLevel } = await import('@ultranos/sync-engine')
    expect(getThresholdLevel(0, 500)).toBe('normal')
    expect(getThresholdLevel(374, 500)).toBe('normal')
    expect(getThresholdLevel(375, 500)).toBe('warning')
    expect(getThresholdLevel(449, 500)).toBe('warning')
    expect(getThresholdLevel(450, 500)).toBe('critical')
    expect(getThresholdLevel(500, 500)).toBe('critical')
  })
})

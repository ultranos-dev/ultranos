import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDataBudgetConfig,
  updateDataBudgetConfig,
  recordDataUsage,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
} from '../lib/db'

describe('Data Budget — Dexie Schema & Helpers (opd-lite)', () => {
  beforeEach(async () => {
    const { db } = await import('../lib/db')
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  afterEach(async () => {
    const { db } = await import('../lib/db')
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

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

  it('updates config fields without overwriting others', async () => {
    await updateDataBudgetConfig({ planSizeMB: 1000, lowDataMode: true })
    const config = await getDataBudgetConfig()
    expect(config.planSizeMB).toBe(1000)
    expect(config.lowDataMode).toBe(true)
    expect(config.billingCycleDay).toBe(1)
  })

  it('records data usage entries', async () => {
    await recordDataUsage({ date: '2026-06-05', category: 'upload', bytesOut: 2048, bytesIn: 512, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-05', category: 'audit', bytesOut: 256, bytesIn: 64, requestCount: 1 })
    const { db } = await import('../lib/db')
    const rows = await db.table('dataUsage').toArray()
    expect(rows).toHaveLength(2)
  })

  it('getUsageByDay filters by date range', async () => {
    await recordDataUsage({ date: '2026-06-01', category: 'upload', bytesOut: 1000, bytesIn: 100, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-10', category: 'upload', bytesOut: 2000, bytesIn: 200, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-20', category: 'upload', bytesOut: 3000, bytesIn: 300, requestCount: 1 })
    const results = await getUsageByDay('2026-06-05', '2026-06-15')
    expect(results).toHaveLength(1)
    expect(results[0]?.date).toBe('2026-06-10')
  })

  it('checkAndRolloverCycle rolls over when cycle has expired', async () => {
    await updateDataBudgetConfig({
      billingCycleDay: 1,
      currentCycleStart: '2026-04-01',
    })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(true)
    const config = await getDataBudgetConfig()
    expect(config.currentCycleStart).not.toBe('2026-04-01')
    // Should have rolled to the first of the current month
    const today = new Date()
    const expectedStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    expect(config.currentCycleStart).toBe(expectedStart)
  })

  it('getUsageForCycle returns records since cycle start and excludes earlier records', async () => {
    await updateDataBudgetConfig({ currentCycleStart: '2026-06-01' })
    await recordDataUsage({ date: '2026-05-20', category: 'other', bytesOut: 100, bytesIn: 50, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-05', category: 'upload', bytesOut: 200, bytesIn: 100, requestCount: 1 })
    const results = await getUsageForCycle()
    expect(results).toHaveLength(1)
    expect(results[0]?.date).toBe('2026-06-05')
  })

  it('getUsageForCycle returns empty array when no records exist', async () => {
    const results = await getUsageForCycle()
    expect(results).toHaveLength(0)
  })

  it('checkAndRolloverCycle does not roll over within current cycle', async () => {
    const today = new Date()
    const thisMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    await updateDataBudgetConfig({ billingCycleDay: 1, currentCycleStart: thisMonthStart })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(false)
  })
})

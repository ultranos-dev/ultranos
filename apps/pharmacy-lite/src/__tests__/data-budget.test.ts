import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import {
  db,
  getDataBudgetConfig,
  updateDataBudgetConfig,
  recordDataUsage,
  getUsageForCycle,
  getUsageByDay,
  checkAndRolloverCycle,
} from '../lib/db'

describe('Data Budget — Dexie Schema & Helpers (pharmacy-lite)', () => {
  beforeEach(async () => {
    await db.table('dataBudgetConfig').clear()
    await db.table('dataUsage').clear()
  })

  afterEach(async () => {
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

  it('updates config without overwriting unspecified fields', async () => {
    await updateDataBudgetConfig({ planSizeMB: 250 })
    const config = await getDataBudgetConfig()
    expect(config.planSizeMB).toBe(250)
    expect(config.billingCycleDay).toBe(1)
    expect(config.lowDataMode).toBe(false)
  })

  it('records and retrieves usage entries', async () => {
    await recordDataUsage({ date: '2026-06-05', category: 'audit', bytesOut: 512, bytesIn: 128, requestCount: 1 })
    const results = await getUsageByDay('2026-06-01', '2026-06-30')
    expect(results).toHaveLength(1)
    expect(results[0]?.category).toBe('audit')
  })

  it('getUsageByDay filters by date range', async () => {
    await recordDataUsage({ date: '2026-06-01', category: 'upload', bytesOut: 1000, bytesIn: 100, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-10', category: 'upload', bytesOut: 2000, bytesIn: 200, requestCount: 1 })
    await recordDataUsage({ date: '2026-06-20', category: 'upload', bytesOut: 3000, bytesIn: 300, requestCount: 1 })
    const results = await getUsageByDay('2026-06-05', '2026-06-15')
    expect(results).toHaveLength(1)
    expect(results[0]?.date).toBe('2026-06-10')
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

  it('checkAndRolloverCycle rolls over when cycle has expired', async () => {
    await updateDataBudgetConfig({ billingCycleDay: 1, currentCycleStart: '2026-03-01' })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(true)
    const config = await getDataBudgetConfig()
    expect(config.currentCycleStart).not.toBe('2026-03-01')
    const today = new Date()
    const expectedStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    expect(config.currentCycleStart).toBe(expectedStart)
  })

  it('checkAndRolloverCycle does not roll over within current cycle', async () => {
    const today = new Date()
    const thisMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    await updateDataBudgetConfig({ billingCycleDay: 1, currentCycleStart: thisMonthStart })
    const rolled = await checkAndRolloverCycle()
    expect(rolled).toBe(false)
  })
})

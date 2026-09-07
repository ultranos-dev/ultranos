import { describe, it, expect } from 'vitest'
import { computeAging } from '@/lib/pos/aging'

const DAY = 86_400_000
describe('computeAging', () => {
  it('buckets charges by age and ignores payments', () => {
    const now = 1_000 * DAY
    const buckets = computeAging([
      { amount: 100, timestamp: new Date(now - 5 * DAY).toISOString() },   // current
      { amount: 200, timestamp: new Date(now - 45 * DAY).toISOString() },  // 31-60
      { amount: 50, timestamp: new Date(now - 200 * DAY).toISOString() },  // 90+
      { amount: -30, timestamp: new Date(now).toISOString() },             // payment ignored
    ], now)
    expect(buckets).toEqual({ current: 100, thirtyDay: 200, sixtyDay: 0, ninetyPlus: 50 })
  })
})

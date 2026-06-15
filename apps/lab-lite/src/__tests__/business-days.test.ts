import { describe, it, expect } from 'vitest'
import { addBusinessDays, getDefaultWeekendDays } from '../lib/business-days'

describe('business-days', () => {
  describe('getDefaultWeekendDays', () => {
    it('returns [4, 5] (Thu=4, Fri=5) for Afghanistan default', () => {
      expect(getDefaultWeekendDays()).toEqual([4, 5])
    })
  })

  describe('addBusinessDays', () => {
    // Thursday=4, Friday=5 are weekend (Afghanistan default)

    it('adds zero days → returns same date', () => {
      expect(addBusinessDays('2026-06-01', 0)).toBe('2026-06-01') // Monday
    })

    it('adds 1 business day on a Monday → Tuesday', () => {
      // 2026-06-01 is Monday
      expect(addBusinessDays('2026-06-01', 1)).toBe('2026-06-02')
    })

    it('adds 1 business day on a Wednesday → skips Thu-Fri, lands on Saturday', () => {
      // 2026-06-03 is Wednesday, +1 skip Thu 06-04 + Fri 06-05 → Saturday 06-06
      expect(addBusinessDays('2026-06-03', 1)).toBe('2026-06-06')
    })

    it('adds 3 business days crossing a weekend', () => {
      // 2026-06-01 Mon → +1=Tue 06-02, +2=Wed 06-03, +3=skip Thu 06-04+Fri 06-05→ Sat 06-06
      expect(addBusinessDays('2026-06-01', 3)).toBe('2026-06-06')
    })

    it('handles month boundary correctly', () => {
      // 2026-05-27 is Wednesday → +1=Sat 2026-05-30, skipping Thu 28 + Fri 29
      expect(addBusinessDays('2026-05-27', 1)).toBe('2026-05-30')
    })

    it('handles year boundary correctly', () => {
      // 2025-12-31 is Wednesday → +1=Sat 2026-01-03, skipping Thu+Fri
      expect(addBusinessDays('2025-12-31', 1)).toBe('2026-01-03')
    })

    it('respects custom weekend days — Friday-Saturday for UAE', () => {
      // 2026-06-02 (Tuesday) +3 business days with [5,6] weekend:
      // +1=Wed 06-03, +2=Thu 06-04, +3=skip Fri 06-05+Sat 06-06 → Sun 06-07
      expect(addBusinessDays('2026-06-02', 3, [5, 6])).toBe('2026-06-07')
    })

    it('respects Friday-only weekend', () => {
      // 2026-06-03 Wednesday → +1 skip Fri 06-05 → Sat 06-06? No: skip only Fri → Thu 06-04
      // Wed+1 = Thu 06-04 (Thu is not weekend in this config)
      expect(addBusinessDays('2026-06-03', 1, [5])).toBe('2026-06-04')
    })

    it('starting on a weekend day → immediately advances to next business day then counts', () => {
      // Start on Thu 2026-06-04 (weekend), +1 business day →
      // advance to Sat 06-06, then +1 → Sun 06-07? No, +0 from Sat = Sat, then +1=Mon 06-08
      // Actually: if we start on a weekend, first find next business day (Sat 06-06), then add N more
      expect(addBusinessDays('2026-06-04', 0)).toBe('2026-06-06') // Thu is weekend → next biz = Sat
      expect(addBusinessDays('2026-06-04', 1)).toBe('2026-06-07') // Sat+1=Sun 06-07
    })
  })
})

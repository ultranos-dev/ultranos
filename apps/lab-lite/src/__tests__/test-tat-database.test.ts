import { describe, it, expect } from 'vitest'
import {
  getTatProfile,
  DEFAULT_TAT_PROFILES,
  type TatCategory,
  type TestTatProfile,
} from '../lib/test-tat-database'

describe('TAT database', () => {
  describe('DEFAULT_TAT_PROFILES', () => {
    it('has a profile for every LOINC code in loinc-categories', () => {
      const EXPECTED_LOINC_CODES = [
        '58410-2', // CBC
        '57698-3', // Lipid Panel
        '4548-4',  // HbA1c
        '51990-0', // Basic Metabolic Panel
        '24325-3', // Liver Function Tests
        '3016-3',  // TSH
        '24356-8', // Urinalysis
        '1558-6',  // Blood Glucose Fasting
      ]
      const profileCodes = DEFAULT_TAT_PROFILES.map((p) => p.loincCode)
      for (const code of EXPECTED_LOINC_CODES) {
        expect(profileCodes).toContain(code)
      }
    })

    it('marks Urinalysis and Blood Glucose as rapid (canWait: true)', () => {
      const urinalysis = DEFAULT_TAT_PROFILES.find((p) => p.loincCode === '24356-8')
      const glucose = DEFAULT_TAT_PROFILES.find((p) => p.loincCode === '1558-6')
      expect(urinalysis?.tatCategory).toBe<TatCategory>('rapid')
      expect(urinalysis?.canWait).toBe(true)
      expect(glucose?.tatCategory).toBe<TatCategory>('rapid')
      expect(glucose?.canWait).toBe(true)
    })

    it('marks CBC, BMP, Lipid, HbA1c, LFT, TSH as same-day (canWait: true)', () => {
      const sameDay = ['58410-2', '51990-0', '57698-3', '4548-4', '24325-3', '3016-3']
      for (const code of sameDay) {
        const profile = DEFAULT_TAT_PROFILES.find((p) => p.loincCode === code)
        expect(profile?.tatCategory, `${code} should be same-day`).toBe<TatCategory>('same-day')
        expect(profile?.canWait, `${code} canWait`).toBe(true)
      }
    })

    it('all profiles have estimatedMinutes > 0', () => {
      for (const profile of DEFAULT_TAT_PROFILES) {
        expect(profile.estimatedMinutes, `${profile.loincCode} estimatedMinutes`).toBeGreaterThan(0)
      }
    })

    it('rapid profiles have estimatedMinutes < 60', () => {
      const rapidProfiles = DEFAULT_TAT_PROFILES.filter((p) => p.tatCategory === 'rapid')
      for (const profile of rapidProfiles) {
        expect(profile.estimatedMinutes, `${profile.loincCode} rapid must be <60 min`).toBeLessThan(60)
      }
    })

    it('same-day profiles have estimatedMinutes between 30 and 240', () => {
      const sameDayProfiles = DEFAULT_TAT_PROFILES.filter((p) => p.tatCategory === 'same-day')
      for (const profile of sameDayProfiles) {
        expect(profile.estimatedMinutes, `${profile.loincCode} same-day 30-240 min`).toBeGreaterThanOrEqual(30)
        expect(profile.estimatedMinutes, `${profile.loincCode} same-day 30-240 min`).toBeLessThanOrEqual(240)
      }
    })
  })

  describe('getTatProfile', () => {
    it('returns correct profile for known LOINC code', () => {
      const cbc = getTatProfile('58410-2')
      expect(cbc).toBeDefined()
      expect(cbc?.loincCode).toBe('58410-2')
      expect(cbc?.tatCategory).toBe('same-day')
    })

    it('returns undefined for unknown LOINC code', () => {
      expect(getTatProfile('99999-9')).toBeUndefined()
    })

    it('uses override when provided', () => {
      const overrides: Partial<Record<string, TestTatProfile>> = {
        '58410-2': {
          loincCode: '58410-2',
          loincDisplay: 'CBC (custom)',
          tatCategory: 'rapid',
          estimatedMinutes: 10,
          canWait: true,
          remoteDelivery: false,
        },
      }
      const cbc = getTatProfile('58410-2', overrides)
      expect(cbc?.tatCategory).toBe('rapid')
      expect(cbc?.estimatedMinutes).toBe(10)
    })

    it('falls back to default when override does not include the code', () => {
      const overrides: Partial<Record<string, TestTatProfile>> = {}
      const cbc = getTatProfile('58410-2', overrides)
      expect(cbc?.tatCategory).toBe('same-day')
    })
  })
})

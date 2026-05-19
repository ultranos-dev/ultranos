import { describe, it, expect } from 'vitest'
import {
  FREE_FEATURES,
  PREMIUM_FEATURES,
  SAFETY_CRITICAL_FEATURES,
  isFeaturePremium,
  isSafetyCritical,
  type FeatureId,
} from '../feature-tiers.js'

describe('feature-tiers', () => {
  describe('FREE_FEATURES', () => {
    it('includes all expected free features', () => {
      expect(FREE_FEATURES).toContain('HEALTH_PASSPORT_QR')
      expect(FREE_FEATURES).toContain('VIEW_ACTIVE_MEDICATIONS')
      expect(FREE_FEATURES).toContain('VIEW_ALLERGIES')
      expect(FREE_FEATURES).toContain('LANGUAGE_SELECTION')
      expect(FREE_FEATURES).toContain('CONSENT_MANAGEMENT')
      expect(FREE_FEATURES).toContain('BASIC_APPOINTMENT_HISTORY')
    })

    it('has exactly 6 free features', () => {
      expect(FREE_FEATURES).toHaveLength(6)
    })
  })

  describe('PREMIUM_FEATURES', () => {
    it('includes all expected premium features', () => {
      expect(PREMIUM_FEATURES).toContain('MEDICAL_HISTORY_EXPORT')
      expect(PREMIUM_FEATURES).toContain('GUARDIAN_LINKING')
      expect(PREMIUM_FEATURES).toContain('NOTIFICATION_CENTER')
      expect(PREMIUM_FEATURES).toContain('PRESCRIPTION_HISTORY')
      expect(PREMIUM_FEATURES).toContain('PRIORITY_SUPPORT')
    })

    it('has exactly 5 premium features', () => {
      expect(PREMIUM_FEATURES).toHaveLength(5)
    })
  })

  describe('SAFETY_CRITICAL_FEATURES', () => {
    it('includes allergies, active medications, and consent management', () => {
      expect(SAFETY_CRITICAL_FEATURES).toContain('VIEW_ALLERGIES')
      expect(SAFETY_CRITICAL_FEATURES).toContain('VIEW_ACTIVE_MEDICATIONS')
      expect(SAFETY_CRITICAL_FEATURES).toContain('CONSENT_MANAGEMENT')
    })

    it('has exactly 3 safety-critical features', () => {
      expect(SAFETY_CRITICAL_FEATURES).toHaveLength(3)
    })

    it('is a subset of FREE_FEATURES', () => {
      for (const feature of SAFETY_CRITICAL_FEATURES) {
        expect(FREE_FEATURES).toContain(feature)
      }
    })
  })

  describe('isFeaturePremium', () => {
    it('returns true for premium features', () => {
      expect(isFeaturePremium('MEDICAL_HISTORY_EXPORT')).toBe(true)
      expect(isFeaturePremium('GUARDIAN_LINKING')).toBe(true)
      expect(isFeaturePremium('NOTIFICATION_CENTER')).toBe(true)
      expect(isFeaturePremium('PRESCRIPTION_HISTORY')).toBe(true)
      expect(isFeaturePremium('PRIORITY_SUPPORT')).toBe(true)
    })

    it('returns false for free features', () => {
      expect(isFeaturePremium('HEALTH_PASSPORT_QR')).toBe(false)
      expect(isFeaturePremium('VIEW_ACTIVE_MEDICATIONS')).toBe(false)
      expect(isFeaturePremium('VIEW_ALLERGIES')).toBe(false)
      expect(isFeaturePremium('LANGUAGE_SELECTION')).toBe(false)
      expect(isFeaturePremium('CONSENT_MANAGEMENT')).toBe(false)
      expect(isFeaturePremium('BASIC_APPOINTMENT_HISTORY')).toBe(false)
    })
  })

  describe('isSafetyCritical', () => {
    it('returns true for safety-critical features', () => {
      expect(isSafetyCritical('VIEW_ALLERGIES')).toBe(true)
      expect(isSafetyCritical('VIEW_ACTIVE_MEDICATIONS')).toBe(true)
      expect(isSafetyCritical('CONSENT_MANAGEMENT')).toBe(true)
    })

    it('returns false for non-safety-critical free features', () => {
      expect(isSafetyCritical('HEALTH_PASSPORT_QR')).toBe(false)
      expect(isSafetyCritical('LANGUAGE_SELECTION')).toBe(false)
      expect(isSafetyCritical('BASIC_APPOINTMENT_HISTORY')).toBe(false)
    })

    it('returns false for premium features', () => {
      expect(isSafetyCritical('MEDICAL_HISTORY_EXPORT')).toBe(false)
      expect(isSafetyCritical('GUARDIAN_LINKING')).toBe(false)
    })
  })

  describe('uniqueness', () => {
    it('has no duplicate feature IDs across free and premium', () => {
      const all = [...FREE_FEATURES, ...PREMIUM_FEATURES]
      const unique = new Set(all)
      expect(unique.size).toBe(all.length)
    })
  })
})

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Story 27.11 Task 7: Safety validation tests (Hub API)
 *
 * These tests assert that commercial logic (premium tier gating) never
 * interferes with clinical safety features. This is the most critical
 * test suite in the freemium story.
 *
 * Safety-critical endpoints: allergy, medicationStatement, consent
 * These must NEVER use enforcePremiumTier middleware.
 */

// Read router source files to check for middleware usage
const ROUTERS_DIR = join(__dirname, '..', 'trpc', 'routers')

function readRouterSource(filename: string): string {
  return readFileSync(join(ROUTERS_DIR, filename), 'utf-8')
}

describe('premium safety validation — Hub API', () => {
  describe('allergy endpoints do NOT use enforcePremiumTier', () => {
    it('allergy router source does not contain enforcePremiumTier', () => {
      const source = readRouterSource('allergy.ts')
      expect(source).not.toContain('enforcePremiumTier')
    })
  })

  describe('medication safety endpoints do NOT use enforcePremiumTier', () => {
    it('medication-statement router source does not contain enforcePremiumTier', () => {
      const source = readRouterSource('medication-statement.ts')
      expect(source).not.toContain('enforcePremiumTier')
    })
  })

  describe('consent endpoints do NOT use enforcePremiumTier', () => {
    it('consent router source does not contain enforcePremiumTier', () => {
      const source = readRouterSource('consent.ts')
      expect(source).not.toContain('enforcePremiumTier')
    })
  })

  describe('runtime assertion prevents misconfiguration', () => {
    it('enforcePremiumTier throws when applied to safety-critical feature VIEW_ALLERGIES', async () => {
      const { enforcePremiumTier } = await import('../trpc/middleware/enforcePremiumTier')
      expect(() => enforcePremiumTier('VIEW_ALLERGIES' as any)).toThrow(
        'CONFIGURATION ERROR',
      )
    })

    it('enforcePremiumTier throws when applied to safety-critical feature VIEW_ACTIVE_MEDICATIONS', async () => {
      const { enforcePremiumTier } = await import('../trpc/middleware/enforcePremiumTier')
      expect(() => enforcePremiumTier('VIEW_ACTIVE_MEDICATIONS' as any)).toThrow(
        'CONFIGURATION ERROR',
      )
    })

    it('enforcePremiumTier throws when applied to safety-critical feature CONSENT_MANAGEMENT', async () => {
      const { enforcePremiumTier } = await import('../trpc/middleware/enforcePremiumTier')
      expect(() => enforcePremiumTier('CONSENT_MANAGEMENT' as any)).toThrow(
        'CONFIGURATION ERROR',
      )
    })
  })
})

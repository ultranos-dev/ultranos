import { render } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Story 27.11 Task 7: Safety validation tests (Mobile)
 *
 * Verifies that safety-critical screens (allergies, medications, consent)
 * are NEVER wrapped with PremiumGate. These are non-negotiable.
 */

jest.mock('@/hooks/usePatientProfile', () => ({
  usePatientProfile: jest.fn().mockReturnValue({ patient: null, isLoading: false, error: null }),
}))

jest.mock('@/hooks/useConsentSettings', () => ({
  useConsentSettings: jest.fn().mockReturnValue({
    categories: [],
    consentHistory: [],
    isLoading: false,
    error: null,
    toggleConsent: jest.fn(),
    refreshConsent: jest.fn(),
  }),
}))

jest.mock('@/hooks/useGuardianLink', () => ({
  useGuardianLink: jest.fn().mockReturnValue({
    guardianLink: null,
    isLoading: false,
    error: null,
    unlinkCurrentGuardian: jest.fn(),
    refresh: jest.fn(),
  }),
}))

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}))

const SCREENS_DIR = join(__dirname, '..', 'src', 'screens')
const NAVIGATION_DIR = join(__dirname, '..', 'src', 'navigation')

function readSource(dir: string, filename: string): string {
  return readFileSync(join(dir, filename), 'utf-8')
}

describe('premium safety validation — Mobile UI', () => {
  describe('allergy screens are never gated', () => {
    it('AllergyDetailScreen source does not contain PremiumGate', () => {
      const source = readSource(SCREENS_DIR, 'AllergyDetailScreen.tsx')
      expect(source).not.toContain('PremiumGate')
    })
  })

  describe('consent management screen is never gated', () => {
    it('PrivacySettingsScreen source does not contain PremiumGate', () => {
      const source = readSource(SCREENS_DIR, 'PrivacySettingsScreen.tsx')
      expect(source).not.toContain('PremiumGate')
    })
  })

  describe('medication list screen is accessible to FREE tier', () => {
    it('HomeDashboardScreen source does not contain PremiumGate', () => {
      const source = readSource(SCREENS_DIR, 'HomeDashboardScreen.tsx')
      expect(source).not.toContain('PremiumGate')
    })

    it('TimelineScreen source does not contain PremiumGate', () => {
      const source = readSource(SCREENS_DIR, 'TimelineScreen.tsx')
      expect(source).not.toContain('PremiumGate')
    })
  })

  describe('safety-critical navigation stacks are never gated', () => {
    it('HomeStack does not contain PremiumGate', () => {
      const source = readSource(NAVIGATION_DIR, 'HomeStack.tsx')
      expect(source).not.toContain('PremiumGate')
    })

    it('TimelineStack does not contain PremiumGate', () => {
      const source = readSource(NAVIGATION_DIR, 'TimelineStack.tsx')
      expect(source).not.toContain('PremiumGate')
    })
  })

  describe('PrivacySettingsScreen renders without premium gating', () => {
    it('PrivacySettingsScreen is accessible directly (no PremiumGate wrapper)', () => {
      // Verify the PrivacyStack only gates GuardianLinkScreen, not PrivacySettingsScreen
      const source = readSource(NAVIGATION_DIR, 'PrivacyStack.tsx')
      // PrivacySettingsScreen should use `component={PrivacySettingsScreen}` directly
      expect(source).toContain('component={PrivacySettingsScreen}')
      // It should NOT use a gated wrapper for PrivacySettingsScreen
      expect(source).not.toContain('GatedPrivacySettingsScreen')
    })
  })
})

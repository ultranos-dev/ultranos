/**
 * Story 18.3, Task 1: Language Onboarding Gateway screen.
 *
 * Composes VisualLanguageGateway + OnboardingFlow into a single screen
 * that the AuthNavigator shows on first login (after biometric enrollment).
 *
 * The OnboardingFlow already handles:
 * - Step 0: Language selection via VisualLanguageGateway
 * - Step 1: "This is your Health Passport" illustration
 * - Step 2: "Show this to your doctor" illustration
 * - Skip link + AsyncStorage persistence
 */

import { OnboardingFlow } from '@/components/OnboardingFlow'

interface OnboardingScreenProps {
  onComplete: () => void
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  return <OnboardingFlow onComplete={onComplete} />
}

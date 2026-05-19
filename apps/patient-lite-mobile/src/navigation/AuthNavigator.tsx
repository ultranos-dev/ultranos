/**
 * AuthNavigator — Switches between LoginScreen and TabNavigator
 * based on authentication state.
 *
 * Story 18.2, Task 5 + Story 18.3: Auth flow routing with onboarding.
 *
 * Flow:
 *   1. No session → LoginScreen
 *   2. First login → BiometricEnrollmentScreen → OnboardingScreen → TabNavigator
 *   3. Session + biometric enrolled → Biometric gate (useDatabaseUnlock) → TabNavigator
 *   4. Session + no biometric → TabNavigator directly
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { NavigationContainer, type LinkingOptions } from '@react-navigation/native'
import { useAuthStore } from '@/stores/auth-store'
import { useDatabaseUnlock } from '@/hooks/use-database-unlock'
import { useSessionExpiry } from '@/hooks/useSessionExpiry'
import { LoginScreen } from '@/screens/LoginScreen'
import { BiometricEnrollmentScreen } from '@/screens/BiometricEnrollmentScreen'
import { OnboardingScreen } from '@/screens/OnboardingScreen'
import { isOnboardingComplete } from '@/components/OnboardingFlow'
import { RegistrationNavigator } from '@/navigation/RegistrationNavigator'
import { TabNavigator } from '@/navigation/TabNavigator'
import type { RootTabParamList } from '@/navigation/types'
import {
  consumerColors,
  consumerSpacing,
  consumerTypography,
} from '@/theme/consumer'

const linking: LinkingOptions<RootTabParamList> = {
  prefixes: ['ultranos://'],
  config: {
    screens: {
      HomeTab: {
        path: 'home',
        screens: { HomeScreen: '' },
      },
      TimelineTab: {
        path: 'timeline',
        screens: { TimelineScreen: '' },
      },
      PrivacyTab: {
        path: 'privacy',
        screens: { PrivacySettingsScreen: '' },
      },
      NotificationsTab: {
        path: 'notifications',
        screens: { NotificationsScreen: '' },
      },
    },
  },
}

type AuthPhase = 'login' | 'registration' | 'biometric-enrollment' | 'onboarding' | 'biometric-gate' | 'app'

export function AuthNavigator() {
  const { t } = useTranslation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isFirstLogin = useAuthStore((s) => s.isFirstLogin)
  const biometricEnrolled = useAuthStore((s) => s.biometricEnrolled)

  const [authPhase, setAuthPhase] = useState<AuthPhase>(() => {
    if (!isAuthenticated) return 'login'
    if (biometricEnrolled) return 'biometric-gate'
    return 'app'
  })

  const { isUnlocked, isUnlocking, error: unlockError, unlock } = useDatabaseUnlock()
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => { isMountedRef.current = false }
  }, [])

  // Enforce 90-day session expiry on foreground (Task 6)
  useSessionExpiry()

  // Check onboarding status on mount for returning users who never completed it
  useEffect(() => {
    if (isAuthenticated && !isFirstLogin && authPhase === 'app') {
      isOnboardingComplete().then((complete) => {
        if (isMountedRef.current && !complete) setAuthPhase('onboarding')
      })
    }
  }, [isAuthenticated, isFirstLogin, authPhase])

  // --- Registration / Login toggle ---
  const handleGoToRegistration = useCallback(() => {
    setAuthPhase('registration')
  }, [])

  const handleGoToLogin = useCallback(() => {
    setAuthPhase('login')
  }, [])

  // --- Registration complete handler ---
  const handleRegistrationComplete = useCallback((_userId: string) => {
    // After registration: go to onboarding (language gateway) per AC #5
    setAuthPhase('onboarding')
  }, [])

  // --- Login success handler ---
  const handleLoginSuccess = useCallback(
    (_userId: string, firstLogin: boolean) => {
      if (firstLogin) {
        setAuthPhase('biometric-enrollment')
      } else if (biometricEnrolled) {
        setAuthPhase('biometric-gate')
      } else {
        // Check onboarding for returning users
        isOnboardingComplete().then((complete) => {
          if (isMountedRef.current) setAuthPhase(complete ? 'app' : 'onboarding')
        })
      }
    },
    [biometricEnrolled],
  )

  // --- Biometric enrollment complete → check onboarding ---
  const handleBiometricEnrollmentComplete = useCallback(() => {
    // Story 18.3: First login → Language Onboarding Gateway before app
    setAuthPhase('onboarding')
  }, [])

  // --- Onboarding complete ---
  const handleOnboardingComplete = useCallback(() => {
    setAuthPhase('app')
  }, [])

  // --- Render by phase ---

  if (authPhase === 'registration' && !isAuthenticated) {
    return (
      <View style={{ flex: 1 }}>
        <RegistrationNavigator onRegistrationComplete={handleRegistrationComplete} />
        <View style={styles.switchAuthRow}>
          <Text style={styles.switchAuthText}>{t('registration.haveAccount')}</Text>
          <Pressable onPress={handleGoToLogin} accessibilityRole="button">
            <Text style={styles.switchAuthLink}>{t('registration.signIn')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (authPhase === 'login' || !isAuthenticated) {
    return (
      <View style={{ flex: 1 }}>
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
        <View style={styles.switchAuthRow}>
          <Text style={styles.switchAuthText}>{t('registration.noAccount')}</Text>
          <Pressable onPress={handleGoToRegistration} accessibilityRole="button">
            <Text style={styles.switchAuthLink}>{t('registration.signUp')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  if (authPhase === 'biometric-enrollment' && isFirstLogin) {
    return <BiometricEnrollmentScreen onComplete={handleBiometricEnrollmentComplete} />
  }

  if (authPhase === 'onboarding') {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />
  }

  if (authPhase === 'biometric-gate' && biometricEnrolled && !isUnlocked) {
    return (
      <View style={styles.biometricContainer}>
        <Text style={styles.lockEmoji}>🔒</Text>
        <Text style={styles.biometricTitle}>{t('auth.welcomeTitle')}</Text>
        {unlockError && (
          <Text style={styles.errorText}>{t('auth.verifyError')}</Text>
        )}
        <Pressable
          style={styles.unlockButton}
          onPress={unlock}
          disabled={isUnlocking}
          accessibilityRole="button"
          accessibilityLabel={t('auth.biometricUnlock')}
        >
          <Text style={styles.unlockButtonText}>
            {isUnlocking ? t('common.loading') : t('auth.biometricUnlock')}
          </Text>
        </Pressable>
      </View>
    )
  }

  // Phase: app — show the main tab navigator
  return (
    <NavigationContainer linking={linking}>
      <TabNavigator />
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  biometricContainer: {
    flex: 1,
    backgroundColor: consumerColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: consumerSpacing.screenPadding,
  },
  lockEmoji: {
    fontSize: 64,
    marginBottom: consumerSpacing.lg,
  },
  biometricTitle: {
    fontSize: consumerTypography.headerSize,
    fontWeight: consumerTypography.fontWeightHeader,
    color: consumerColors.textPrimary,
    marginBottom: consumerSpacing.lg,
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.error,
    textAlign: 'center',
    marginBottom: consumerSpacing.md,
  },
  unlockButton: {
    backgroundColor: consumerColors.primary,
    borderRadius: 12,
    paddingVertical: consumerSpacing.md,
    paddingHorizontal: consumerSpacing.xl,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockButtonText: {
    fontSize: consumerTypography.bodySize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: '#FFFFFF',
  },
  switchAuthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: consumerSpacing.xl,
    gap: consumerSpacing.xs,
    backgroundColor: consumerColors.surface,
  },
  switchAuthText: {
    fontSize: consumerTypography.captionSize,
    color: consumerColors.textSecondary,
  },
  switchAuthLink: {
    fontSize: consumerTypography.captionSize,
    fontWeight: consumerTypography.fontWeightLabel,
    color: consumerColors.primary,
  },
})

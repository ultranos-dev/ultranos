/**
 * RegistrationNavigator — Orchestrates the patient self-registration flow.
 *
 * Story 27.10, Task 4.5: Stack navigator for registration flow.
 *
 * Flow: PhoneInput → OtpVerification → ProfileSetup → BiometricSetup → complete
 *
 * On completion:
 * - Calls register() Hub API endpoint
 * - Sets session in auth store
 * - Navigates to language gateway (first time) or home (subsequent logins) via AuthNavigator
 */
import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { PhoneInputScreen } from '@/screens/registration/PhoneInputScreen'
import { OtpVerificationScreen } from '@/screens/registration/OtpVerificationScreen'
import { ProfileSetupScreen } from '@/screens/registration/ProfileSetupScreen'
import { BiometricSetupScreen } from '@/screens/registration/BiometricSetupScreen'
import { register } from '@/lib/registration-api'
import { useAuthStore } from '@/stores/auth-store'
import { useTheme } from '@/theme/ThemeProvider'
import { consumerSpacing, consumerTypography } from '@/theme/consumer'

const SESSION_TOKEN_KEY = 'ultranos_session_tokens'

type RegistrationStep = 'phone' | 'otp' | 'profile' | 'biometric' | 'submitting'

export interface RegistrationNavigatorProps {
  onRegistrationComplete: (userId: string) => void
}

export function RegistrationNavigator({ onRegistrationComplete }: RegistrationNavigatorProps) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const setSession = useAuthStore((s) => s.setSession)

  const [step, setStep] = useState<RegistrationStep>('phone')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpVerifiedAt, setOtpVerifiedAt] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  /** P7: Max time between OTP verification and profile submission (4 min safety margin). */
  const OTP_MAX_AGE_MS = 4 * 60 * 1000

  // Step 1: Phone number entered, OTP sent
  const handleOtpSent = useCallback((fullPhone: string) => {
    setPhone(fullPhone)
    setStep('otp')
  }, [])

  // Step 2: OTP verified (locally — actual verification happens at registration)
  const handleOtpVerified = useCallback((code: string) => {
    setOtpCode(code)
    setOtpVerifiedAt(Date.now())
    setStep('profile')
  }, [])

  // Step 3: Profile collected — submit registration to Hub API
  const handleProfileComplete = useCallback(
    async (profile: { firstName: string; dateOfBirth: string; preferredLanguage: string }) => {
      setStep('submitting')
      setError(null)

      // P7: If OTP was verified too long ago, redirect back to OTP screen
      if (otpVerifiedAt && Date.now() - otpVerifiedAt > OTP_MAX_AGE_MS) {
        setError(t('auth.otpExpiredRetry'))
        setOtpCode('')
        setStep('otp')
        return
      }

      try {
        const result = await register({
          phone,
          otpCode,
          firstName: profile.firstName,
          dateOfBirth: profile.dateOfBirth,
          preferredLanguage: profile.preferredLanguage,
        })

        // P2: Persist session tokens securely for authenticated API calls
        await SecureStore.setItemAsync(
          SESSION_TOKEN_KEY,
          JSON.stringify({
            accessToken: result.session.accessToken,
            refreshToken: result.session.refreshToken,
          }),
          { keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY },
        ).catch(() => {
          // Best-effort — tokens in memory until next app restart
        })

        // D1: Use server-provided expiresAt instead of client-computed 90 days
        const expiresAt = typeof result.session.expiresAt === 'number'
          ? new Date(result.session.expiresAt * 1000).toISOString()
          : new Date(result.session.expiresAt).toISOString()

        await setSession(result.patientId, expiresAt, true)
        setStep('biometric')
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Registration failed. Please try again.',
        )
        setStep('profile')
      }
    },
    [phone, otpCode, otpVerifiedAt, OTP_MAX_AGE_MS, t, setSession],
  )

  // Step 4: Biometric setup complete (or skipped)
  const handleBiometricComplete = useCallback(() => {
    const userId = useAuthStore.getState().userId
    if (userId) {
      onRegistrationComplete(userId)
    }
  }, [onRegistrationComplete])

  // Back handlers
  const handleBackToPhone = useCallback(() => {
    setStep('phone')
    setOtpCode('')
    setError(null)
  }, [])

  const handleBackToOtp = useCallback(() => {
    setStep('otp')
    setError(null)
  }, [])

  if (step === 'submitting') {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.surface }]}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t('registration.submitting')}
        </Text>
      </View>
    )
  }

  switch (step) {
    case 'phone':
      return <PhoneInputScreen onOtpSent={handleOtpSent} />
    case 'otp':
      return (
        <OtpVerificationScreen
          phone={phone}
          onVerified={handleOtpVerified}
          onBack={handleBackToPhone}
        />
      )
    case 'profile':
      return (
        <>
          <ProfileSetupScreen
            onComplete={handleProfileComplete}
            onBack={handleBackToOtp}
          />
          {error && (
            <View style={styles.errorOverlay}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          )}
        </>
      )
    case 'biometric':
      return <BiometricSetupScreen onComplete={handleBiometricComplete} />
    default:
      return null
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: consumerSpacing.md,
  },
  loadingText: {
    fontSize: consumerTypography.bodySize,
  },
  errorOverlay: {
    position: 'absolute',
    bottom: consumerSpacing.xl,
    left: consumerSpacing.screenPadding,
    right: consumerSpacing.screenPadding,
  },
  errorText: {
    fontSize: consumerTypography.captionSize,
    textAlign: 'center',
  },
})
